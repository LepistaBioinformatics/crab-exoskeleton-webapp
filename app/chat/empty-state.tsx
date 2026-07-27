"use client";

import Logo from "@/app/logo";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";

// Shown in the content pane when no workspace is selected -- the second
// sidebar and chat view only exist for a chosen workspace.
export default function EmptyState() {
  const t = useT(chatCopy);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo size={56} />
      <div>
        <h1 className="font-display text-2xl font-bold text-fg">{t.emptyState.title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">{t.emptyState.body}</p>
      </div>
    </div>
  );
}
