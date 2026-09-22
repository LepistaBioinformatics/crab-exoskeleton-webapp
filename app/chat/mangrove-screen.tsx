"use client";

import { useState } from "react";
import { cva } from "class-variance-authority";
import { Check, Inbox, Send, ShieldQuestion, Trash2, X } from "lucide-react";
import type { Workspace } from "./fragment";
import DestinationScreen from "./destination-screen";
import MangroveContent from "./mangrove-content";
import MangrovePeople from "./mangrove-people";
import { useMangrove } from "./use-mangrove";
import { admit, decide, revoke, type MangroveReading } from "@/lib/mangrove";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// The member's window onto the mangrove.
//
// THREE READINGS, AND THE THIRD IS ABSENT RATHER THAN EMPTY for somebody who
// governs nothing. An affordance that renders and then refuses teaches the
// wrong model of who decides — so the tab does not show a "Pending decisions"
// button to a member who cannot make one. Whether they can is a mycelium role,
// which only the proxy can resolve, which is why /v1/mangrove/capabilities exists.
//
// AND "NOTHING YET" IS NOT "IT IS DOWN". An empty reading is a normal state and
// renders as prose; an unreachable service renders as an error with a retry.
// Collapsing them would mean a member who has simply not been shared anything
// is told something is broken.

const tab = cva(
  "rounded-lg px-3 py-1.5 text-sm transition-colors",
  {
    variants: {
      current: {
        true: "bg-elevated text-fg",
        false: "text-fg-muted hover:text-fg",
      },
    },
  },
);

/** An actor id is `mangrove:actor:<accId>:person|service`. Show the tail, which is
 *  the part a member can tell apart at a glance. */
function actorLabel(id: string): string {
  const m = /^mangrove:actor:(.+):(person|service)$/.exec(id);
  if (!m) return id;
  return m[2] === "service" ? `${m[1]} (bot)` : m[1];
}

function scopeLabel(id: string): string {
  if (id.startsWith("mangrove:group:subscription:")) return "subscription";
  if (id.startsWith("mangrove:group:tenant:")) return "tenant";
  return actorLabel(id);
}

export default function MangroveScreen({ workspace }: { workspace: Workspace }) {
  const t = useT(chatCopy);
  const [reading, setReading] = useState<MangroveReading>("received");
  // People is not a reading -- it does not come from the timeline and must not
  // refetch it. Kept as its own flag so switching to it costs nothing.
  const [onPeople, setOnPeople] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { timeline, caps, error, loading, reload, off } = useMangrove(workspace, reading);

  // The operator never enabled the mangrove. Render NOTHING — not an error, not an
  // empty state with a dead button.
  if (off) return null;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch {
      setActionError(t.mangrove.actionFailed);
    } finally {
      setBusy(null);
    }
  };

  const readings: { key: MangroveReading; label: string }[] = [
    { key: "received", label: t.mangrove.received },
    { key: "published", label: t.mangrove.published },
    // ABSENT, not disabled, for somebody with no governing role.
    ...(caps?.governs ? [{ key: "pending" as MangroveReading, label: t.mangrove.pending }] : []),
  ];

  const claims = timeline?.claims ?? [];
  const held = timeline?.held ?? [];
  const pending = timeline?.pending ?? [];
  const nothing = !loading && !error && claims.length === 0 && held.length === 0 && pending.length === 0;

  return (
    <DestinationScreen title={t.mangrove.title}>
      <p className="text-sm text-fg-muted">{t.mangrove.hint}</p>

      <nav className="mt-4 flex gap-1" aria-label={t.mangrove.title}>
        {readings.map((r) => (
          <button
            key={r.key}
            type="button"
            className={tab({ current: !onPeople && reading === r.key })}
            aria-current={!onPeople && reading === r.key ? "page" : undefined}
            onClick={() => {
              setOnPeople(false);
              setReading(r.key);
            }}
          >
            {r.label}
          </button>
        ))}
        <button
          type="button"
          className={tab({ current: onPeople })}
          aria-current={onPeople ? "page" : undefined}
          onClick={() => setOnPeople(true)}
        >
          {t.mangrove.people}
        </button>
      </nav>

      {onPeople && (
        <div className="mt-6">
          <MangrovePeople workspace={workspace} />
        </div>
      )}

      {!onPeople && actionError && (
        <Alert severity="error" className="mt-4">
          {actionError}
        </Alert>
      )}

      {/* Unreachable is its own answer, with a way to try again. */}
      {!onPeople && error && !off && (
        <Alert severity="error" className="mt-4">
          {error === "mangrove_unreachable" || error === "connectivity"
            ? t.mangrove.unreachable
            : t.mangrove.loadFailed}{" "}
          <Button variant="text" size="sm" onClick={() => void reload()}>
            {t.mangrove.retry}
          </Button>
        </Alert>
      )}

      {!onPeople && nothing && (
        <div className="mt-8 text-sm text-fg-muted">
          <p>{t.mangrove.none}</p>
          <p className="mt-1">{t.mangrove.noneHint}</p>
        </div>
      )}

      {/* Held: addressed at this member, NOT yet in their agent's memory. */}
      {!onPeople && held.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
            <Inbox size={16} aria-hidden /> {t.mangrove.heldTitle}
          </h2>
          <p className="mt-1 text-xs text-fg-muted">{t.mangrove.heldHint}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {held.map((h) => (
              <li key={h.activityId} className="rounded-xl border border-rule-strong bg-surface p-3">
                <p className="text-xs text-fg-muted">
                  {t.mangrove.from.replace("{who}", actorLabel(h.from))} · {h.object.cell}
                </p>
                <div className="mt-1 text-sm text-fg">
                  <MangroveContent
                    content={h.object.content ?? ""}
                    title={h.object.cell}
                    subtitle={t.mangrove.sheetFrom
                      .replace("{who}", actorLabel(h.from))
                      .replace("{cell}", h.object.cell)}
                  />
                </div>
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={busy === h.activityId}
                  onClick={() => void run(h.activityId, () => admit(workspace, h.activityId))}
                >
                  {t.mangrove.admit}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pending: only ever rendered for a governing role. */}
      {!onPeople && pending.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
            <ShieldQuestion size={16} aria-hidden /> {t.mangrove.pendingTitle}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((p) => (
              <li key={p.activityId} className="rounded-xl border border-rule-strong bg-surface p-3">
                <p className="text-xs text-fg-muted">
                  {t.mangrove.from.replace("{who}", actorLabel(p.author))} → {scopeLabel(p.scope)} · {p.object.cell}
                </p>
                <div className="mt-1 text-sm text-fg">
                  <MangroveContent
                    content={p.object.content ?? ""}
                    title={p.object.cell}
                    subtitle={t.mangrove.sheetFrom
                      .replace("{who}", actorLabel(p.author))
                      .replace("{cell}", p.object.cell)}
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy === p.activityId}
                    onClick={() => void run(p.activityId, () => decide(workspace, p.activityId, true))}
                  >
                    <Check size={14} aria-hidden /> {t.mangrove.accept}
                  </Button>
                  <Button
                    size="sm"
                    variant="text"
                    disabled={busy === p.activityId}
                    onClick={() => void run(p.activityId, () => decide(workspace, p.activityId, false))}
                  >
                    <X size={14} aria-hidden /> {t.mangrove.reject}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!onPeople && claims.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
            <Send size={16} aria-hidden />{" "}
            {reading === "published" ? t.mangrove.publishedTitle : t.mangrove.receivedTitle}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {claims.map((c) => (
              <li
                key={`${c.cell}:${c.author}`}
                className="rounded-xl border border-rule-strong bg-surface p-3"
              >
                <p className="text-xs text-fg-muted">
                  {c.cell} · {actorLabel(c.author)}
                  {c.audience.length > 0 && ` · ${c.audience.map(scopeLabel).join(", ")}`}
                  {/* Weight of evidence, never a verdict. */}
                  {c.evidence > 0 && ` · ${t.mangrove.evidence.replace("{n}", String(c.evidence))}`}
                </p>
                <div className={`mt-1 text-sm ${c.deleted ? "text-fg-muted line-through" : "text-fg"}`}>
                  <MangroveContent
                    content={c.object.content ?? ""}
                    mediaType={c.object.mediaType}
                    title={c.cell}
                    subtitle={t.mangrove.sheetFrom
                      .replace("{who}", actorLabel(c.author))
                      .replace("{cell}", c.cell)}
                  />
                </div>
                {reading === "published" && !c.deleted && (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="text"
                    disabled={busy === c.object.id}
                    onClick={() =>
                      void run(c.object.id, () => revoke(workspace, c.object.id, c.cell))
                    }
                  >
                    <Trash2 size={14} aria-hidden /> {t.mangrove.revoke}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {reading === "published" && claims.length > 0 && (
            // Said plainly, because the alternative is a member believing a
            // revoke recalled something. ActivityPub cannot un-deliver.
            <p className="mt-3 text-xs text-fg-muted">{t.mangrove.revokeNote}</p>
          )}
        </section>
      )}
    </DestinationScreen>
  );
}
