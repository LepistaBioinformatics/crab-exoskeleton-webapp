import { describe, it, expect, vi } from "vitest";
import {
  requestPreview,
  subscribeToPreviewRequests,
  takePendingPreview,
} from "./media-preview-bus";

// file-preview-in-pane FR-3.2. An attachment chip sits deep inside the rendered
// markdown of a message; the panel that shows documents lives at the other end of the
// view. Threading a callback between them would touch every component in between, so
// the chip publishes and the view listens — the same module-scope signalling the
// conversation list and the turn store already use.
describe("the preview request channel", () => {
  const file = { path: "public/attachments/report.pdf", name: "report.pdf", size: 10 };

  it("delivers a request to a listener", () => {
    const heard = vi.fn();
    const stop = subscribeToPreviewRequests(heard);
    requestPreview(file);
    expect(heard).toHaveBeenCalledWith(file);
    stop();
  });

  it("stops delivering once unsubscribed", () => {
    const heard = vi.fn();
    subscribeToPreviewRequests(heard)();
    requestPreview(file);
    expect(heard).not.toHaveBeenCalled();
  });

  // Two views can be mounted across a remount; a request must not reach only the
  // first one to have subscribed.
  it("delivers to every listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeToPreviewRequests(a);
    const stopB = subscribeToPreviewRequests(b);
    requestPreview(file);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    stopA();
    stopB();
  });
});

// chat-shell-redesign FR-5.5. The chip is in the transcript and the files surface is a
// DESTINATION, so the click is also a navigation: the chat view unmounts and the files
// screen mounts, and the fan-out above has long finished by the time anything there
// could subscribe. Published into an empty room, the request is simply lost.
describe("a request published before anything is listening", () => {
  const file = { path: "public/attachments/report.pdf", name: "report.pdf", size: 10 };

  it("waits, and is handed to whoever arrives next", () => {
    requestPreview(file);
    expect(takePendingPreview()).toEqual(file);
  });

  // CONSUMED, not remembered — which is the distinction that keeps this from being the
  // "last requested file" store this module refuses to be. A remembered value reopens a
  // document on every remount; there is nothing left here to reopen.
  it("is gone once it has been taken", () => {
    requestPreview(file);
    takePendingPreview();
    expect(takePendingPreview()).toBeNull();
  });

  it("is null when nobody asked for anything", () => {
    expect(takePendingPreview()).toBeNull();
  });
});
