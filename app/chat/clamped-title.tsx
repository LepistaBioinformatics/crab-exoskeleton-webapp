"use client";

import { useState } from "react";
import { clampText } from "@/app/chat/clamp-text";

// A section heading that may be a whole paragraph.
//
// A scheduled task's name is usually short, but an orphaned run's heading is the
// PROMPT that produced it -- up to eight kilobytes of it -- and a member-written
// name has no cap either. Rendered whole, one of those pushes every other task
// off the panel.
//
// The toggle appears only when something is hidden (see clampText), so it never
// invites a click that reveals nothing. Collapsed state is per instance and
// local: which headings a member opened is not worth remembering between visits,
// and a stored one would resurrect an expansion they closed on purpose.
export default function ClampedTitle({
  text,
  className,
  more,
  less,
}: {
  text: string;
  className?: string;
  /** "Show more" / "Show less", from the caller's own dictionary. */
  more: string;
  less: string;
}) {
  const [open, setOpen] = useState(false);
  const { head, truncated } = clampText(text);

  return (
    <p className={className}>
      {/* `break-words` because the case that overflows is a long unbroken token,
          which is exactly what a width-constrained panel cannot wrap on its own. */}
      <span className="break-words">{open ? text : head}</span>
      {truncated && (
        <>
          {!open && <span aria-hidden>…</span>}{" "}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            // Not an IconButton: this is inline with the text it governs, and a
            // control that sat beside the line would read as acting on the row
            // rather than on the sentence.
            className="align-baseline text-[11px] font-normal text-accent underline-offset-2 hover:underline"
          >
            {open ? less : more}
          </button>
        </>
      )}
    </p>
  );
}
