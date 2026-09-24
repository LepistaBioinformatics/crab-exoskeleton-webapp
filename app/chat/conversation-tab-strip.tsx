"use client";

// THE STRIP OF WHAT IS OPEN, drawn the way an editor draws it.
//
// It sits under the breadcrumb and above the centre pane. The breadcrumb says where the
// ACTIVE tab is; this says what else is open — two different questions, and putting the
// second below the transcript would collide with `turn-dock`, which is already there and
// is a third question again ("what is running").
//
// A READ-OUT PLUS TWO GESTURES, and nothing else: it holds no state. The list and which
// one is active are the shell's, because the active tab IS the fragment and only the
// shell writes that.

import { X } from "lucide-react";
import { sameTab, type Tab, type TabRef } from "./conversation-tabs";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

export default function ConversationTabStrip({
  tabs,
  active,
  onActivate,
  onPin,
  onClose,
}: {
  tabs: readonly Tab[];
  /** Where the fragment currently points, or null when the centre is not a conversation. */
  active: TabRef | null;
  onActivate: (ref: TabRef) => void;
  /** A double click keeps it. The composer pins too, without coming through here. */
  onPin: (ref: TabRef) => void;
  onClose: (ref: TabRef) => void;
}) {
  const t = useT(chatCopy);

  // ABSENT RATHER THAN EMPTY. A member who has opened nothing has no strip at all,
  // instead of a band of dead chrome above every conversation they ever read. It
  // appears when it has something to say, which is the first single click.
  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label={t.tabs.label}
      className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-rule px-2"
    >
      {tabs.map((tab) => {
        const here = active !== null && sameTab(tab, active);
        return (
          // THE × IS A SIBLING OF THE TAB, NOT A CHILD, and that is what keeps closing
          // from first navigating into the thing being closed. A button nested in a
          // button is invalid anyway, and the browser that tolerates it fires both
          // handlers -- which is how projects-screen.tsx came to put its edit and
          // delete controls beside the card rather than inside it.
          //
          // There is no `stopPropagation` here because there is nothing to stop: this
          // div has no click handler for the event to reach. One was written and
          // removed when falsifying the test that was supposed to cover it did not
          // fail -- a guard against something the structure already prevents reads as
          // though the structure did not.
          <div
            key={`${tab.t}|${tab.s}|${tab.r}|${tab.p ?? ""}|${tab.sid}`}
            className={[
              "group flex min-w-0 max-w-52 shrink-0 items-center gap-1 border-b-2 pl-3 pr-1 transition-colors",
              here
                ? "border-b-accent bg-elevated text-fg"
                : "border-b-transparent text-fg-muted hover:bg-elevated/60 hover:text-fg",
            ].join(" ")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={here}
              // THE TWO GESTURES AN EDITOR USES. One click goes there and leaves the tab
              // provisional; two keeps it. `onDoubleClick` fires AFTER its own second
              // `onClick`, so activating twice is harmless -- the second is a no-op on a
              // tab that is already active, and that is why activate is not guarded.
              onClick={() => onActivate(tab)}
              onDoubleClick={() => onPin(tab)}
              title={tab.title || t.tabs.untitled}
              className={[
                "min-w-0 flex-1 truncate py-2 text-left text-xs",
                // ITALIC IS THE PREVIEW, which is the one visual convention every editor
                // shares for "this will be replaced by the next thing you click".
                tab.preview ? "italic" : "",
              ].join(" ")}
            >
              {tab.title || t.tabs.untitled}
            </button>
            <button
              type="button"
              aria-label={`${t.tabs.close} ${tab.title || t.tabs.untitled}`}
              title={t.tabs.close}
              onClick={() => onClose(tab)}
              className={[
                "shrink-0 rounded p-0.5 text-fg-muted transition-opacity hover:bg-rule-strong hover:text-fg",
                // ALWAYS THERE ON THE ACTIVE TAB, and on hover for the rest. A control
                // that only appears on hover cannot be reached on a touch screen, and
                // the active tab is the one most likely to be closed.
                here
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
              ].join(" ")}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
