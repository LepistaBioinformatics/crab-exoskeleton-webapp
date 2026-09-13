import { describe, expect, it, vi } from "vitest";
import { publishMediaChanged, subscribeToMediaChanged } from "./media-refresh-bus";

describe("media refresh bus", () => {
  it("notifies every subscriber", () => {
    const composer = vi.fn();
    const filesScreen = vi.fn();
    const stop = [subscribeToMediaChanged(composer), subscribeToMediaChanged(filesScreen)];

    publishMediaChanged();

    expect(composer).toHaveBeenCalledTimes(1);
    expect(filesScreen).toHaveBeenCalledTimes(1);
    stop.forEach((fn) => fn());
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    subscribeToMediaChanged(listener)();

    publishMediaChanged();

    expect(listener).not.toHaveBeenCalled();
  });

  it("still reaches a listener that an earlier one unsubscribed", () => {
    // The hazard the copy in publishMediaChanged exists for: a listener that tears
    // something down during the notification removes a set entry the iteration has not
    // reached yet, and a live set would simply skip it. React makes this ordinary —
    // publishing can unmount a screen whose sibling is still subscribed.
    const later = vi.fn();
    let stopLater = () => {};
    const stopFirst = subscribeToMediaChanged(() => stopLater());
    stopLater = subscribeToMediaChanged(later);

    publishMediaChanged();

    expect(later).toHaveBeenCalledTimes(1);
    stopFirst();
  });
});
