"use client";

import { useEffect, useState } from "react";
import { Search, UserRound } from "lucide-react";
import type { Workspace } from "./fragment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import {
  findPeople,
  readIdentity,
  MangroveError,
  type DirectoryEntry,
  type MangroveIdentity,
} from "@/lib/mangrove";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// Finding somebody to share with, and handing out your own handle.
//
// THE SEARCH ANSWERS ONE OF TWO QUESTIONS, and the member is told which. Where
// an administrator has not enabled prefix search, only a whole email address
// matches and the result carries NO id -- just confirmation that the person is
// reachable, and an email to address them by. Showing a search box that quietly
// ignores partial input would read as the person not existing.
//
// YOUR OWN IDS ARE ALWAYS HERE, in either mode. They are yours, and the point of
// having them is to give them to somebody whose deployment cannot look you up.

export default function MangrovePeople({ workspace }: { workspace: Workspace }) {
  const t = useT(chatCopy);
  const [identity, setIdentity] = useState<MangroveIdentity | null>(null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"exact" | "prefix" | null>(null);
  const [results, setResults] = useState<DirectoryEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readIdentity(workspace)
      .then((id) => {
        if (!cancelled) setIdentity(id);
      })
      .catch(() => {
        // The tab already reports an unreachable mangrove; a second copy of that
        // message here would say nothing new.
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const search = async () => {
    const needle = q.trim();
    if (!needle) return;
    setSearching(true);
    setError(null);
    try {
      const out = await findPeople(workspace, needle);
      setMode(out.mode);
      setResults(out.results);
    } catch (err) {
      setResults(null);
      setError(err instanceof MangroveError ? err.code : "unknown");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Your own handles. */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
          <UserRound size={16} aria-hidden /> {t.mangrove.yourIdentity}
        </h2>
        <p className="mt-1 text-xs text-fg-muted">{t.mangrove.yourIdentityHint}</p>
        {identity && (
          <dl className="mt-3 flex flex-col gap-2">
            {[
              { label: t.mangrove.yourEmail, value: identity.email },
              { label: t.mangrove.yourAgentId, value: identity.serviceId },
              { label: t.mangrove.yourPersonId, value: identity.personId },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 rounded-lg border border-rule-strong bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <dt className="text-xs text-fg-muted">{row.label}</dt>
                  <dd className="truncate font-mono text-xs text-fg">{row.value}</dd>
                </div>
                <CopyButton text={row.value} />
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Finding somebody else. */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
          <Search size={16} aria-hidden /> {t.mangrove.findPeople}
        </h2>
        <p className="mt-1 text-xs text-fg-muted">
          {mode === "prefix" ? t.mangrove.findHintPrefix : t.mangrove.findHintExact}
        </p>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.mangrove.findPlaceholder}
            aria-label={t.mangrove.findPeople}
          />
          <Button type="submit" size="sm" disabled={searching || !q.trim()}>
            {t.mangrove.find}
          </Button>
        </form>

        {error && (
          <p className="mt-2 text-xs text-fg-muted">
            {error === "http_400" ? t.mangrove.findTooShort : t.mangrove.findFailed}
          </p>
        )}

        {/* An empty result is a real answer, not a missing one. */}
        {results !== null && results.length === 0 && !error && (
          <p className="mt-3 text-sm text-fg-muted">{t.mangrove.findNone}</p>
        )}

        {results !== null && results.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {results.map((r) => (
              <li
                key={r.email}
                className="flex items-center justify-between gap-3 rounded-lg border border-rule-strong bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{r.email}</p>
                  {r.actorId ? (
                    <p className="truncate font-mono text-xs text-fg-muted">{r.actorId}</p>
                  ) : (
                    // Strict mode: the id is withheld, so say what to use instead
                    // rather than leaving a blank line where an id would be.
                    <p className="text-xs text-fg-muted">{t.mangrove.shareByEmail}</p>
                  )}
                </div>
                <CopyButton text={r.actorId ?? `email:${r.email}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
