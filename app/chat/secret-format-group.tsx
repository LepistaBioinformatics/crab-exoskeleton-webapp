"use client";

import { FormEvent, useState } from "react";
import { Trash2 } from "lucide-react";
import { SECRET_NAME_RE, type SecretFormat } from "@/lib/secrets";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// One collapsible group per secret sink.
//
// The format picker it replaces asked the member to choose a storage sink before
// they had said what they were storing — the one decision they have least
// context for. As a group, the sink is a place you open, and the header says
// what is already in it.
//
// `writable` is not decoration. A sink the agent cannot read (or that only an
// administrator may write) gets its list and no form: offering a form that
// stores something nothing will ever read is exactly the silent failure this
// whole drawer keeps trying to remove.

export default function SecretFormatGroup({
  format,
  title,
  hint,
  names,
  writable,
  notice,
  busy,
  onSave,
  onDelete,
}: {
  format: SecretFormat;
  title: string;
  hint: string;
  names: string[];
  /** False for a sink the member may not write, or that is not delivered. */
  writable: boolean;
  /** Said above the list when the sink needs a caveat of its own. */
  notice?: string;
  busy: string | null;
  onSave: (format: SecretFormat, name: string, value: string) => Promise<boolean>;
  onDelete: (format: SecretFormat, name: string) => void;
}) {
  const t = useT(chatCopy);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const finalName = name.trim();
    if (!SECRET_NAME_RE.test(finalName)) {
      setError(t.secrets.invalidName);
      return;
    }
    if (!value) {
      setError(t.secrets.valueRequired);
      return;
    }
    setSaving(true);
    const ok = await onSave(format, finalName, value);
    setSaving(false);
    if (ok) {
      setName("");
      setValue(""); // never keep a value around after submit
    }
  }

  // The header states the sink's own state, so nobody opens four groups to find
  // out which one holds anything.
  const summary =
    names.length === 0
      ? t.secrets.groupEmpty
      : names.length === 1
        ? t.secrets.groupOne
        : t.secrets.groupMany.replace("{n}", String(names.length));

  return (
    <Accordion title={title} summary={summary} hint={hint} variant="section">
      {notice && <Alert severity="info">{notice}</Alert>}

      {names.length > 0 && (
        <ul className="flex flex-col gap-1">
          {names.map((secretName) => (
            <li
              key={secretName}
              className="flex items-center gap-2 rounded-lg border border-brand/30 bg-elevated px-3 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{secretName}</span>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`${t.secrets.deletePrefix} ${secretName}`}
                disabled={busy === secretName}
                onClick={() => onDelete(format, secretName)}
              >
                <Trash2 size={15} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {writable && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">{t.secrets.nameLabel}</span>
            <Input
              inputSize="md"
              placeholder={t.secrets.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">{t.secrets.valueLabel}</span>
            <Input
              inputSize="md"
              type="password"
              autoComplete="off"
              placeholder={t.secrets.valuePlaceholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>

          {error && <Alert severity="error">{error}</Alert>}

          <Button type="submit" variant="filled" size="sm" disabled={saving}>
            {saving ? t.secrets.saving : t.secrets.save}
          </Button>
        </form>
      )}
    </Accordion>
  );
}
