"use client";

import { useEffect, useState } from "react";

// WHETHER THE HTML PREVIEW MAY RUN SCRIPTS, for this browser session and no longer.
//
// `sessionStorage`, deliberately, and this is the whole of FR-2: it survives a reload and
// a navigation inside the tab, and it is gone when the tab closes. `localStorage` would
// outlive the decision — a member who agreed once, to read one report, would find every
// HTML file executing months later with nothing on screen to say why.
//
// Nothing reaches the server. This is not a preference on an account; it is a choice
// about one browser, for as long as it stays open.
//
// A module-scope subscriber set rather than a context, for the reason the other buses in
// this directory give: two previews can be mounted at once (the pane and a message's
// attachment), and a setting one of them changed has to reach the other without the shell
// owning state that is not its business.

const KEY = "crab-html-scripts";

const listeners = new Set<() => void>();

/**
 * Reads the session's answer. FALSE on anything that is not an explicit yes, including
 * every way storage can fail — a private window, blocked site data, a browser that
 * throws on access. A preview that cannot ask must render with scripts OFF: the safe
 * answer is the one the member gets when the question cannot be put.
 */
export function htmlScriptsEnabled(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * Records the answer for this session. A write that throws is not an error the member
 * has to read — it means the choice does not stick, and the preview goes on rendering
 * with scripts off, which is what it was already doing.
 */
export function setHtmlScripts(enabled: boolean): void {
  try {
    if (enabled) window.sessionStorage.setItem(KEY, "on");
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable. Nothing to tell: the state below is read back from storage,
    // so a failed write simply leaves the switch where it was.
  }
  for (const listener of listeners) listener();
}

/**
 * The setting, as state. Reads in an effect rather than in `useState`'s initialiser:
 * the server render has no `sessionStorage`, and reading during render would make the
 * first client paint disagree with the HTML it is hydrating.
 *
 * THE COST, stated rather than discovered: in a session where scripts are ON, the frame
 * paints once with `sandbox=""` and then remounts with `allow-scripts`, so the document
 * parses twice. Accepted. The extra render is in the SAFE direction -- a page never runs
 * before the answer is known -- and `useSyncExternalStore` would not remove it either,
 * because a server snapshot has no storage to read and hydration would take the same two
 * passes.
 */
export function useHtmlScripts(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const sync = () => setEnabled(htmlScriptsEnabled());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return enabled;
}
