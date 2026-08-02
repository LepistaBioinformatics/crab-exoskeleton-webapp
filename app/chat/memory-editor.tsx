"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { readMemory, writeMemory } from "@/lib/memory";
import type { Workspace } from "./fragment";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// An editor for the workspace's MEMORY_CUSTOM.md -- standing notes the user writes
// for the agent, read at turn time. The load is keyed to the workspace ONLY (never a
// file-refresh signal), so uploading a file can't clobber an in-progress edit.
//
// It used to be a collapsible section stacked in the workspace panel. It is now one
// destination of that panel's sliding track, so the collapse is gone: the member had
// to click the section, watch it slide, and then click a second closed header with the
// same title. Mounting IS opening here — the pane renders only for the chosen section
// — so the document loads on mount.
export default function MemoryEditor({ workspace }: { workspace: Workspace }) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const c = useT(commonCopy);
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A real workspace switch drops the loaded doc so it reloads on next open.
  useEffect(() => {
    setLoaded(false);
    setValue("");
    setError(null);
    setSaved(false);
  }, [workspace.t, workspace.s, workspace.r]);

  // `loading` is deliberately NOT a dependency: including it would make
  // setLoading(true) re-run this effect and its cleanup would cancel the in-flight
  // fetch (spinner stuck forever). The `loaded` guard already prevents a second fetch.
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    setLoading(true);
    readMemory(workspace)
      .then((content) => {
        if (!cancelled) {
          setValue(content);
          setLoaded(true);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, workspace.t, workspace.s, workspace.r]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await writeMemory(workspace, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 pb-3 pt-2">
      <p className="mb-2 text-[11px] leading-snug text-fg-muted">{t.memory.hint}</p>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner size={20} />
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-brand/30 bg-elevated p-2 focus-within:ring-2 focus-within:ring-accent-soft">
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t.memory.placeholder}
              // Taller than the old collapsible box: the pane owns the whole column
              // now, and this document is prose the member actually writes.
              className="h-[60vh] min-h-40 overflow-auto font-mono text-xs leading-relaxed"
            />
          </div>

          {error && (
            <div className="mt-2">
              <Alert severity="error">{errorText(err, error)}</Alert>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="filled" onClick={onSave} disabled={saving || !loaded}>
              {saving ? <Spinner size={14} /> : <Save size={14} aria-hidden />}
              {c.actions.save}
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                <Check size={13} aria-hidden /> {t.memory.saved}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
