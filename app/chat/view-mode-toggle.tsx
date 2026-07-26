"use client";

import { cva } from "class-variance-authority";
import { MessagesSquare, GanttChartSquare } from "lucide-react";
import { setView } from "./fragment";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";

// The workspace-level Traditional | Canvas switch, shared by the chat header
// (enter Canvas) and the canvas header (leave Canvas) so both stay identical.
// Same segmented-control shape as the sidebar's List | Tree toggle.
const seg = cva(
  "flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors",
  {
    variants: {
      active: { true: "bg-accent/15 text-accent", false: "text-fg-muted hover:text-fg" },
    },
    defaultVariants: { active: false },
  },
);

export default function ViewModeToggle({ view }: { view: "chat" | "canvas" }) {
  const t = useT(chatCopy);
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-brand/40 bg-elevated p-0.5">
      <button
        type="button"
        onClick={() => setView("chat")}
        className={seg({ active: view === "chat" })}
        aria-pressed={view === "chat"}
        title={t.viewMode.chatTitle}
      >
        <MessagesSquare size={13} aria-hidden />
        {t.viewMode.chat}
      </button>
      <button
        type="button"
        onClick={() => setView("canvas")}
        className={seg({ active: view === "canvas" })}
        aria-pressed={view === "canvas"}
        title={t.viewMode.canvasTitle}
      >
        <GanttChartSquare size={13} aria-hidden />
        {t.viewMode.canvas}
      </button>
    </div>
  );
}
