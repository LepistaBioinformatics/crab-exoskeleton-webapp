"use client";

import { useState } from "react";
import { cva } from "class-variance-authority";
import { Search, X } from "lucide-react";
import type { Workspace } from "./fragment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  findPeople,
  subscriptionGroupId,
  tenantGroupId,
  MangroveError,
  type DirectoryEntry,
  type MangroveCapabilities,
  type MangroveEmailTarget,
} from "@/lib/mangrove";
import { chatCopy, type ChatDict } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// WHO READS THIS -- asked in one place, because it is now asked twice.
//
// The composer asks it about something being written, and a post asks it again when
// its author passes it on. The two questions are the same question: one scope, the
// people picked under it, and the same rule about which scopes this member may give
// at all. Two copies of it would be two answers to "may I address the tenant" waiting
// to disagree.
//
// EVERYBODY FOUND BY SEARCH IS ADDRESSED BY EMAIL, never by the id a result may
// carry. In the mode an administrator has not opened up, the directory returns no id
// at all -- so an id is something the sender is not guaranteed to have, and addressing
// built on one would work in one deployment and quietly fail in the next. `toEmails`
// works in both, which makes it the only form worth having here. The ids on screen
// stay what they always were: something to read and copy.
//
// A GROUP OPTION THE MEMBER MAY NOT USE IS ABSENT, NOT DISABLED. Whether they may
// address a subscription or a tenant is a mycelium role that only the proxy can
// resolve, which is the whole reason /v1/mangrove/capabilities exists -- somebody who
// governs nothing sees no group option, rather than one that renders and then refuses.

const selectClass =
  "h-9 rounded-lg border border-rule-strong bg-elevated px-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

/** Which of somebody's two actors a memory is addressed at. */
export type Reach = "person" | "agent" | "both";

export interface Recipient {
  email: string;
  reach: Reach;
}

/**
 * WHO READS THIS. Exactly one answer, which is why it is a union and not a set of
 * flags: the previous shape let a post go to named people AND the subscription AND
 * the tenant at once, and "who reads this" is not three questions.
 *
 * `private` is a real answer where something is being WRITTEN -- an empty audience
 * publishes to the author alone, a thing agents do constantly. It is not an answer
 * where something already published is being passed on, which is why the caller says
 * whether to offer it rather than this module assuming.
 */
export type AudienceScope = "private" | "people" | "subscription" | "tenant";

const segment = cva("rounded-md px-3 py-1.5 text-sm transition-colors", {
  variants: {
    active: {
      true: "bg-accent/15 font-medium text-fg",
      false: "text-fg-muted hover:bg-elevated hover:text-fg",
    },
  },
  defaultVariants: { active: false },
});

export function scopeLabel(scope: AudienceScope, t: ChatDict): string {
  switch (scope) {
    case "private":
      return t.mangrove.scopePrivate;
    case "people":
      return t.mangrove.scopePeople;
    case "subscription":
      return t.mangrove.groupSubscription;
    case "tenant":
      return t.mangrove.groupTenant;
  }
}

// One line under the control saying what the chosen answer MEANS. The three that
// travel have consequences a member should not have to infer, and "only you" is
// the one most easily mistaken for having forgotten to choose.
export function scopeNote(scope: AudienceScope, t: ChatDict): string {
  switch (scope) {
    case "private":
      return t.mangrove.scopePrivateNote;
    case "people":
      return t.mangrove.scopePeopleNote;
    case "subscription":
    case "tenant":
      return t.mangrove.groupNote;
  }
}

/**
 * The scopes this member may actually give.
 *
 * `withPrivate` is the caller's call, not a capability: publishing to nobody is a
 * note kept in your own agent's memory, and re-sharing something to nobody is not an
 * operation at all.
 */
export function offeredScopes(
  caps: MangroveCapabilities | null,
  withPrivate: boolean,
): AudienceScope[] {
  return [
    ...(withPrivate ? (["private"] as const) : []),
    "people",
    ...(caps?.governs ? (["subscription"] as const) : []),
    ...(caps?.tenantLicensed ? (["tenant"] as const) : []),
  ];
}

/**
 * The scope actually in force.
 *
 * Capabilities arrive after the first render, so a scope can stop being offered under
 * a member who never chose it. Derived rather than corrected in an effect: an effect
 * would let one paint go out naming a scope that is not on offer. The fallback is the
 * FIRST offered scope rather than a literal, because "private" is not always one.
 */
export function resolveScope(chosen: AudienceScope, offered: AudienceScope[]): AudienceScope {
  return offered.includes(chosen) ? chosen : offered[0];
}

/**
 * The audience the chosen scope means.
 *
 * Recipients picked under `people` are KEPT when the member switches away, and
 * simply do not travel: switching back restores the list rather than punishing a
 * look at the other options. Nothing is ambiguous on screen, because the list is
 * only rendered under the scope that sends it.
 */
export function audienceFor(
  scope: AudienceScope,
  workspace: Workspace,
  recipients: Recipient[],
): { to: string[]; toEmails: MangroveEmailTarget[] } {
  switch (scope) {
    case "subscription":
      return { to: [subscriptionGroupId(workspace)], toEmails: [] };
    case "tenant":
      return { to: [tenantGroupId(workspace)], toEmails: [] };
    case "people":
      return { to: [], toEmails: targets(recipients) };
    case "private":
      return { to: [], toEmails: [] };
  }
}

function targets(recipients: Recipient[]): MangroveEmailTarget[] {
  return recipients.map((r) => ({
    email: r.email,
    person: r.reach !== "agent",
    agent: r.reach !== "person",
  }));
}

/**
 * What to say when the mangrove comes back refused.
 *
 * A refusal names the addressee that was out of reach and why, and that sentence is
 * the only thing the sender can act on -- so it is shown as it arrived. Only the
 * codes this client itself invents get a translation.
 */
export function failureText(code: string, t: ChatDict): string {
  if (code === "mangrove_unreachable" || code === "connectivity") return t.mangrove.unreachable;
  const invented = ["unknown", "session_expired", "invalid_request", "mangrove_off"];
  if (invented.includes(code) || /^http_\d+$/.test(code)) return t.mangrove.publishFailed;
  return code;
}

/**
 * The control itself: one scope, and the people picked under it.
 *
 * Stateless about the answer -- the scope and the recipients belong to whoever is
 * sending, because they outlive this control (the composer keeps them across an
 * attachment change, a post keeps them while its panel is open). The typed needle and
 * its results are this control's own, because they are a search and not an answer.
 */
export default function AudiencePicker({
  workspace,
  offered,
  scope,
  onScope,
  recipients,
  onRecipients,
}: {
  workspace: Workspace;
  offered: AudienceScope[];
  scope: AudienceScope;
  onScope: (scope: AudienceScope) => void;
  recipients: Recipient[];
  onRecipients: (next: (prev: Recipient[]) => Recipient[]) => void;
}) {
  const t = useT(chatCopy);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"exact" | "prefix" | null>(null);
  const [results, setResults] = useState<DirectoryEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const search = async () => {
    const needle = q.trim();
    if (!needle) return;
    setSearching(true);
    setSearchError(null);
    try {
      const out = await findPeople(workspace, needle);
      setMode(out.mode);
      setResults(out.results);
    } catch (err) {
      setResults(null);
      setSearchError(err instanceof MangroveError ? err.code : "unknown");
    } finally {
      setSearching(false);
    }
  };

  const add = (email: string) => {
    onRecipients((prev) =>
      // Somebody already on the list is not added twice -- their reach is what
      // the row is for.
      prev.some((r) => r.email === email) ? prev : [...prev, { email, reach: "person" }],
    );
  };

  return (
    <>
      <section>
        <h3 className="text-sm font-medium text-fg">{t.mangrove.audienceLabel}</h3>

        {/* A radiogroup, not tabs: tabs promise panels that persist, and these are
            answers to one question. Only the ones this member may give are offered --
            a group they cannot address would render and then be refused, which is the
            thing `capabilities` exists to prevent. */}
        <div
          role="radiogroup"
          aria-label={t.mangrove.audienceLabel}
          className="mt-2 flex flex-wrap gap-1 rounded-lg border border-rule-strong bg-surface p-1"
        >
          {offered.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={scope === s}
              className={segment({ active: scope === s })}
              onClick={() => onScope(s)}
            >
              {scopeLabel(s, t)}
            </button>
          ))}
        </div>

        <p className="mt-2 text-xs text-fg-muted">{scopeNote(scope, t)}</p>

        {scope === "people" && recipients.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {recipients.map((r) => (
              <li
                key={r.email}
                className="flex items-center justify-between gap-3 rounded-lg border border-rule-strong bg-surface px-3 py-2"
              >
                <p className="min-w-0 truncate text-sm text-fg">{r.email}</p>
                <div className="flex items-center gap-2">
                  <select
                    className={selectClass}
                    value={r.reach}
                    aria-label={`${t.mangrove.reachLabel} — ${r.email}`}
                    onChange={(e) =>
                      onRecipients((prev) =>
                        prev.map((x) =>
                          x.email === r.email ? { ...x, reach: e.target.value as Reach } : x,
                        ),
                      )
                    }
                  >
                    <option value="person">{t.mangrove.reachPerson}</option>
                    <option value="agent">{t.mangrove.reachAgent}</option>
                    <option value="both">{t.mangrove.reachBoth}</option>
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="text"
                    aria-label={`${t.mangrove.removeRecipient} — ${r.email}`}
                    onClick={() => onRecipients((prev) => prev.filter((x) => x.email !== r.email))}
                  >
                    <X size={14} aria-hidden /> {t.mangrove.removeRecipient}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Finding somebody to address. The same search the People tab runs, and the
          same two questions it may be able to answer -- said here too, because typing
          half an address and getting nothing reads as the person not existing. */}
      {/* NOT RENDERED under another scope, rather than hidden: a hidden input is
          still tabbable, and a keyboard user would land in a search box for
          recipients this post is not going to have. The typed needle and its results
          live in this component's state, so coming back restores them. */}
      {scope === "people" && (
        <section>
          <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
            <Search size={16} aria-hidden /> {t.mangrove.findPeople}
          </h3>
          <p className="mt-1 text-xs text-fg-muted">
            {mode === "prefix" ? t.mangrove.findHintPrefix : t.mangrove.findHintExact}
          </p>

          <div className="mt-3 flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.mangrove.findPlaceholder}
              aria-label={t.mangrove.findPeople}
              onKeyDown={(e) => {
                // The search may be inside a publish form, so Enter here must run
                // the search rather than send a half-written memory.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={searching || !q.trim()}
              onClick={() => void search()}
            >
              {t.mangrove.find}
            </Button>
          </div>

          {searchError && (
            <p className="mt-2 text-xs text-fg-muted">
              {searchError === "http_400" ? t.mangrove.findTooShort : t.mangrove.findFailed}
            </p>
          )}

          {results !== null && results.length === 0 && !searchError && (
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
                      <p className="text-xs text-fg-muted">{t.mangrove.shareByEmail}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="tonal"
                    aria-label={`${t.mangrove.addRecipient} — ${r.email}`}
                    onClick={() => add(r.email)}
                  >
                    {t.mangrove.addRecipient}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
