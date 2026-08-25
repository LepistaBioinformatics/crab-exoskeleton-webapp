"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { droppedDirectories, isExternalFileDrag } from "@/lib/media";

// Dropping files from outside the browser onto a region (paste-and-drop-upload).
//
// Two things here are not optional, and both are why this is a hook rather than
// four inline handlers:
//
//  1. `dragenter`/`dragleave` fire for EVERY child element the pointer crosses, so
//     a boolean flickers the overlay off and on across a list of messages. The
//     depth counter is what makes "still over the region" a stable answer.
//  2. A file dropped anywhere the page does not handle makes the browser NAVIGATE
//     to it, which destroys the draft and takes the member out of the
//     conversation. The window guard is what makes a missed drop harmless — and
//     it is the reason the gesture was destructive before, rather than merely
//     absent.

function prevent(e: Event) {
  e.preventDefault();
}

// The guard is per-window, not per-zone: two mounted zones must not add two
// listeners, and the first one to unmount must not remove the survivor's.
let guardCount = 0;

function useNavigationGuard() {
  useEffect(() => {
    guardCount += 1;
    if (guardCount === 1) {
      window.addEventListener("dragover", prevent);
      window.addEventListener("drop", prevent);
    }
    return () => {
      guardCount -= 1;
      if (guardCount === 0) {
        window.removeEventListener("dragover", prevent);
        window.removeEventListener("drop", prevent);
      }
    };
  }, []);
}

/**
 * What a drop actually carried. Folders are separated rather than filtered away:
 * they arrive as zero-byte entries that would upload as nonsense files, and the
 * member who dragged one needs to be told why nothing happened — but the message
 * belongs to the surface, which has an error alert, not to this hook.
 */
export interface DroppedFiles {
  files: File[];
  directories: string[];
}

export interface FileDropZone {
  /** Files from outside are being held over the region. */
  over: boolean;
  dropProps: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

export function useFileDrop(
  onDropped: (dropped: DroppedFiles) => void,
  disabled = false,
): FileDropZone {
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  useNavigationGuard();

  const reset = useCallback(() => {
    depth.current = 0;
    setOver(false);
  }, []);

  // A drag that carries no files is somebody else's: the files sidebar's own rows
  // are draggable and put `text/plain` on the transfer, and lighting up for one of
  // those would promise an upload that never happens.
  const accepts = (e: React.DragEvent) => !disabled && isExternalFileDrag(e.dataTransfer);

  return {
    over,
    dropProps: {
      onDragEnter: (e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      // preventDefault on dragover is what makes a target droppable at all;
      // without it the browser refuses the drop and the region silently does
      // nothing.
      onDragOver: (e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (e) => {
        if (!accepts(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: (e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        reset();
        const directories = droppedDirectories(e.dataTransfer);
        const files = Array.from(e.dataTransfer.files ?? []).filter(
          (f) => !directories.includes(f.name),
        );
        if (files.length || directories.length) onDropped({ files, directories });
      },
    },
  };
}
