"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useT } from "@/lib/i18n/context";
import { commonCopy } from "@/lib/i18n/common";

// Copies `text` (the raw markdown) to the clipboard, flashing a check for a
// moment. Used per message so the user can copy a message as markdown.
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT(commonCopy);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. insecure context) -- nothing to surface
    }
  }

  return (
    <IconButton
      variant="ghost"
      size="sm"
      aria-label={t.copy.asMarkdown}
      title={copied ? t.copy.copied : t.copy.asMarkdown}
      onClick={onCopy}
      className={className}
    >
      {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
    </IconButton>
  );
}
