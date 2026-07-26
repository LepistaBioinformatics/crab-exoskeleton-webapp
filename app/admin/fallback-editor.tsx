"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import type { InventoryModel } from "@/lib/models";
import { commonCopy } from "@/lib/i18n/common";
import { useT } from "@/lib/i18n/context";
import { adminCopy } from "@/lib/i18n/admin";

const selectClass =
  "h-9 w-full rounded-lg border border-brand bg-elevated px-2 text-xs text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

// fallbackCandidates excludes the model itself and every non-active model: the
// resolver skips a non-active fallback anyway, so offering one would let an admin
// build a chain that silently does nothing.
export function fallbackCandidates(all: InventoryModel[], self: string): InventoryModel[] {
  return all.filter((m) => m.model_name !== self && m.status === "active");
}

export function FallbackEditor({
  model,
  all,
  busy,
  onSave,
}: {
  model: InventoryModel;
  all: InventoryModel[];
  busy: boolean;
  onSave: (chain: string[]) => void;
}) {
  const c = useT(commonCopy);
  const t = useT(adminCopy);
  const [chain, setChain] = useState<string[]>([...model.fallbacks]);
  const candidates = fallbackCandidates(all, model.model_name).filter((m) => !chain.includes(m.model_name));

  function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= chain.length) return;
    const next = [...chain];
    [next[index], next[to]] = [next[to], next[index]];
    setChain(next);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-elevated p-3">
      <span className="text-xs font-medium text-fg-muted">
        Fallback chain for <span className="font-mono">{model.model_name}</span>
      </span>
      <p className="text-[11px] text-fg-muted">
        This ordered list — not the inventory listing order — becomes{" "}
        <span className="font-mono">agents.defaults.model_fallbacks</span>. Every model here also gets its key
        written into each workspace that uses <span className="font-mono">{model.model_name}</span>.
      </p>

      {chain.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.models.noFallbacks}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {chain.map((name, i) => (
            <li key={name} className="flex items-center gap-2 rounded-lg border border-brand/20 px-2 py-1">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">
                {i + 1}. {name}
              </span>
              <button type="button" aria-label={`Move ${name} up`} className="text-xs text-fg-muted"
                disabled={busy || i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label={`Move ${name} down`} className="text-xs text-fg-muted"
                disabled={busy || i === chain.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <IconButton variant="ghost" size="sm" aria-label={`${c.actions.remove} ${name}`} title={c.actions.remove}
                disabled={busy} onClick={() => setChain(chain.filter((n) => n !== name))}>
                <X size={14} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ol>
      )}

      <select className={selectClass} value="" disabled={busy || candidates.length === 0}
        onChange={(e) => e.target.value && setChain([...chain, e.target.value])}>
        <option value="" disabled>
          {candidates.length === 0 ? "no other active models" : "add a fallback…"}
        </option>
        {candidates.map((m) => (
          <option key={m.model_name} value={m.model_name}>
            {m.model_name}
          </option>
        ))}
      </select>

      <div className="flex justify-end">
        <Button variant="tonal" size="sm" disabled={busy} onClick={() => onSave(chain)}>
          Save chain
        </Button>
      </div>
    </div>
  );
}
