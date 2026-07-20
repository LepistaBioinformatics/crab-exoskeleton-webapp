"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Tags, AtSign, Type, CalendarDays } from "lucide-react";
import { cva } from "class-variance-authority";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { ConversationSummary } from "@/lib/chatSession";

type Prefix = "tag" | "alias" | "text" | "date";

const PILLS: { prefix: Prefix; label: string; Icon: typeof Tags }[] = [
  { prefix: "tag", label: "Tag", Icon: Tags },
  { prefix: "alias", label: "Alias", Icon: AtSign },
  { prefix: "text", label: "Text", Icon: Type },
  { prefix: "date", label: "Date", Icon: CalendarDays },
];

const DATE_PRESETS = ["hoje", "7d", "30d", String(new Date().getFullYear())];

const pill = cva(
  "inline-flex items-center gap-1 rounded-full border border-brand/40 px-2 py-0.5 text-[11px] font-medium text-fg-muted transition-colors hover:border-brand hover:text-fg",
);

const suggestionRow = cva("flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-xs", {
  variants: { active: { true: "bg-accent/15 text-fg", false: "text-fg-muted hover:bg-elevated/60" } },
  defaultVariants: { active: false },
});

// The active token is the last whitespace-separated chunk of the input -- what
// the caret is editing. Autocomplete only acts on a chunk of the form
// "<prefix>:<partial>".
function activeToken(value: string): { start: number; prefix: Prefix | null; partial: string } {
  const start = Math.max(value.lastIndexOf(" ") + 1, 0);
  const chunk = value.slice(start);
  const colon = chunk.indexOf(":");
  if (colon <= 0) return { start, prefix: null, partial: chunk };
  const prefix = chunk.slice(0, colon).toLowerCase();
  const partial = chunk.slice(colon + 1);
  if (prefix === "tag" || prefix === "alias" || prefix === "date") {
    return { start, prefix, partial };
  }
  return { start, prefix: null, partial: chunk };
}

export default function ConversationSearchBar({
  value,
  onChange,
  conversations,
  searching = false,
}: {
  value: string;
  onChange: (value: string) => void;
  conversations: ConversationSummary[];
  searching?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const tagNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) for (const t of c.tags) set.add(t.name);
    return [...set];
  }, [conversations]);

  const aliases = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) if (c.alias) set.add(c.alias);
    return [...set];
  }, [conversations]);

  const { start, prefix, partial } = activeToken(value);

  const suggestions = useMemo(() => {
    if (!prefix) return [];
    const pool = prefix === "tag" ? tagNames : prefix === "alias" ? aliases : DATE_PRESETS;
    const needle = partial.toLowerCase();
    return pool.filter((s) => s.toLowerCase().includes(needle)).slice(0, 8);
  }, [prefix, partial, tagNames, aliases]);

  function applySuggestion(suggestion: string) {
    const head = value.slice(0, start);
    onChange(`${head}${prefix}:${suggestion} `);
    setOpen(false);
    inputRef.current?.focus();
  }

  function seedPrefix(p: Prefix) {
    const sep = value && !value.endsWith(" ") ? " " : "";
    onChange(`${value}${sep}${p}:`);
    setOpen(true);
    setActiveIdx(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applySuggestion(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
        <Input
          ref={inputRef}
          variant="subtle"
          inputSize="sm"
          className={cn("pl-8", searching && "pr-8")}
          placeholder="Filter: tag:  alias:  text:  date:"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {searching && (
          <span className="absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-brand/40 border-t-brand" />
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {PILLS.map(({ prefix: p, label, Icon }) => (
          <button key={p} type="button" className={pill()} onClick={() => seedPrefix(p)}>
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-9 z-20 w-full overflow-hidden rounded-lg border border-brand/30 bg-elevated shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              className={cn(suggestionRow({ active: i === activeIdx }))}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              {prefix}:{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
