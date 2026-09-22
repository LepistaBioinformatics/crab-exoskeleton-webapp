"use client";

import { useState } from "react";
import { FileText, Network, Search, Send, X } from "lucide-react";
import type { Workspace } from "./fragment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import {
  findPeople,
  publish,
  subscriptionGroupId,
  tenantGroupId,
  MangroveError,
  type DirectoryEntry,
  type MangroveCapabilities,
  type MangroveEmailTarget,
  type MangroveMediaType,
  type MangrovePublication,
} from "@/lib/mangrove";
import type { MangroveShare } from "./mangrove-share-bus";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// Writing something into the mangrove, as yourself.
//
// EVERYBODY FOUND BY SEARCH IS ADDRESSED BY EMAIL, never by the id a result may
// carry. In the mode an administrator has not opened up, the directory returns
// no id at all -- so an id is something the sender is not guaranteed to have,
// and addressing built on one would work in one deployment and quietly fail in
// the next. `toEmails` works in both, which makes it the only form worth having
// here. The ids on screen stay what they always were: something to read and
// copy.
//
// A GROUP OPTION THE MEMBER MAY NOT USE IS ABSENT, NOT DISABLED. Whether they
// may address a subscription or a tenant is a mycelium role that only the proxy
// can resolve, which is the whole reason /v1/mangrove/capabilities exists --
// somebody who governs nothing sees no group section, rather than one that
// renders and then refuses.
//
// AND NO AUDIENCE IS A REAL ANSWER. Both lists empty publishes privately to the
// author: a note this member's own agent keeps and nobody else sees. The form
// says so rather than blocking the button until somebody is picked.
//
// AN ATTACHMENT REPLACES THE BODY, IT DOES NOT SIT BESIDE IT. The mangrove takes
// exactly one of prose, a file and a set of entities, and refuses zero or two with a
// 400 -- which a member would meet only after writing something and pressing Share.
// So when a file or a selection arrives from the files tab or the graph, the cell and
// body fields are not disabled, they are GONE: what is left on screen is what will be
// sent, and the way to write prose instead is to remove the attachment.

const selectClass =
  "h-9 rounded-lg border border-rule-strong bg-elevated px-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

/** Which of somebody's two actors a memory is addressed at. */
type Reach = "person" | "agent" | "both";

interface Recipient {
  email: string;
  reach: Reach;
}

function targets(recipients: Recipient[]): MangroveEmailTarget[] {
  return recipients.map((r) => ({
    email: r.email,
    person: r.reach !== "agent",
    agent: r.reach !== "person",
  }));
}

/**
 * What to say when a publish comes back refused.
 *
 * A refusal names the addressee that was out of reach and why, and that
 * sentence is the only thing the sender can act on -- so it is shown as it
 * arrived. Only the codes this client itself invents get a translation.
 */
function failureText(code: string, t: (typeof chatCopy)["en"]): string {
  if (code === "mangrove_unreachable" || code === "connectivity") return t.mangrove.unreachable;
  const invented = ["unknown", "session_expired", "invalid_request", "mangrove_off"];
  if (invented.includes(code) || /^http_\d+$/.test(code)) return t.mangrove.publishFailed;
  return code;
}

export default function MangroveCompose({
  workspace,
  caps,
  attachment,
  onRemoveAttachment,
  onPublished,
}: {
  workspace: Workspace;
  /** Null while the tab is still loading them: no group option until they arrive. */
  caps: MangroveCapabilities | null;
  /**
   * A file or a graph selection the member arrived here WITH, from the files tab or
   * the knowledge graph. Owned by the screen rather than by this form: the member
   * lands on the composer because of it, so it exists before the form is mounted.
   */
  attachment: MangroveShare | null;
  /** Take the attachment off and give the prose fields back. */
  onRemoveAttachment: () => void;
  onPublished: (pending: boolean) => void;
}) {
  const t = useT(chatCopy);
  const [cell, setCell] = useState("");
  const [content, setContent] = useState("");
  const [mediaType, setMediaType] = useState<MangroveMediaType>("text/markdown");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [toSubscription, setToSubscription] = useState(false);
  const [toTenant, setToTenant] = useState(false);

  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"exact" | "prefix" | null>(null);
  const [results, setResults] = useState<DirectoryEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setRecipients((prev) =>
      // Somebody already on the list is not added twice -- their reach is what
      // the row is for.
      prev.some((r) => r.email === email) ? prev : [...prev, { email, reach: "person" }],
    );
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const to = [
        ...(toSubscription ? [subscriptionGroupId(workspace)] : []),
        ...(toTenant ? [tenantGroupId(workspace)] : []),
      ];
      const audience = { to, toEmails: targets(recipients) };
      // ONE of three, decided here and nowhere else. The union refuses a second kind
      // at compile time, so there is no branch in which a body rides along with a file.
      const publication: MangrovePublication =
        attachment?.kind === "file"
          ? { file: attachment.path, ...audience }
          : attachment?.kind === "entities"
            ? { entities: attachment.names, ...audience }
            : { cell: cell.trim(), content, mediaType, ...audience };
      const out = await publish(workspace, publication);
      onPublished(out.pending);
    } catch (err) {
      setError(failureText(err instanceof MangroveError ? err.code : "unknown", t));
    } finally {
      setSending(false);
    }
  };

  // With something attached there is nothing left to fill in: the audience is optional
  // and the content is already chosen, so the only thing that can hold Share back is a
  // send already in flight.
  const ready = attachment
    ? !sending
    : cell.trim().length > 0 && content.trim().length > 0 && !sending;
  const anyGroup = Boolean(caps?.governs) || Boolean(caps?.tenantLicensed);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void send();
      }}
    >
      <p className="text-sm text-fg-muted">
        {attachment ? t.mangrove.attachedHint : t.mangrove.composeHint}
      </p>

      {attachment ? (
        /* WHAT WILL BE SENT, and the only thing that will be. No cell field: the
           mangrove derives the cell for both of these kinds, so a field here would be
           asking for something that is thrown away. */
        <section className="rounded-xl border border-rule-strong bg-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-fg">
                {attachment.kind === "file" ? (
                  <FileText size={14} aria-hidden />
                ) : (
                  <Network size={14} aria-hidden />
                )}
                {attachment.kind === "file"
                  ? t.mangrove.attachedFile
                  : attachment.names.length === 1
                    ? t.mangrove.attachedEntitiesOne
                    : t.mangrove.attachedEntitiesMany.replace(
                        "{count}",
                        String(attachment.names.length),
                      )}
              </p>
              <p
                className="mt-1 truncate text-sm text-fg-muted"
                title={attachment.kind === "file" ? attachment.path : attachment.names.join(", ")}
              >
                {attachment.kind === "file" ? attachment.name : attachment.names.join(", ")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="text"
              aria-label={t.mangrove.removeAttachment}
              onClick={onRemoveAttachment}
            >
              <X size={14} aria-hidden /> {t.mangrove.removeAttachment}
            </Button>
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            {attachment.kind === "file"
              ? t.mangrove.attachedFileHint
              : t.mangrove.attachedEntitiesHint}
          </p>
        </section>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-fg">{t.mangrove.cellLabel}</span>
            <span className="text-xs text-fg-muted">{t.mangrove.cellHint}</span>
            <Input
              className="mt-1"
              value={cell}
              onChange={(e) => setCell(e.target.value)}
              placeholder={t.mangrove.cellPlaceholder}
            />
          </label>

          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-fg">{t.mangrove.bodyLabel}</span>
              <Textarea
                className="mt-1 min-h-40 rounded-lg border border-brand bg-elevated px-3 py-2"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t.mangrove.bodyPlaceholder}
              />
            </label>

            {/* The media type travels with the memory. The preview renderer reads it
                and only sniffs the body when it is absent, so saying "plain text"
                here is what stops a body full of asterisks being rendered as
                emphasis for every reader afterwards. */}
            <label className="mt-2 flex items-center gap-2">
              <span className="text-sm text-fg-muted">{t.mangrove.formatLabel}</span>
              <select
                className={selectClass}
                value={mediaType}
                aria-label={t.mangrove.formatLabel}
                onChange={(e) => setMediaType(e.target.value as MangroveMediaType)}
              >
                <option value="text/markdown">{t.mangrove.formatMarkdown}</option>
                <option value="text/plain">{t.mangrove.formatPlain}</option>
              </select>
            </label>
          </div>
        </>
      )}

      <section>
        <h3 className="text-sm font-medium text-fg">{t.mangrove.audienceLabel}</h3>

        {recipients.length === 0 && !toSubscription && !toTenant && (
          <p className="mt-1 text-xs text-fg-muted">{t.mangrove.audienceNone}</p>
        )}

        {recipients.length > 0 && (
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
                      setRecipients((prev) =>
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
                    onClick={() =>
                      setRecipients((prev) => prev.filter((x) => x.email !== r.email))
                    }
                  >
                    <X size={14} aria-hidden /> {t.mangrove.removeRecipient}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Groups: rendered ONLY for a member who may address them. */}
        {anyGroup && (
          <div className="mt-4 flex flex-col gap-2">
            <h4 className="text-xs font-medium text-fg-muted">{t.mangrove.groupsLabel}</h4>
            {caps?.governs && (
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={toSubscription}
                  onChange={(e) => setToSubscription(e.target.checked)}
                />
                {t.mangrove.groupSubscription}
              </label>
            )}
            {caps?.tenantLicensed && (
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={toTenant}
                  onChange={(e) => setToTenant(e.target.checked)}
                />
                {t.mangrove.groupTenant}
              </label>
            )}
            <p className="text-xs text-fg-muted">{t.mangrove.groupNote}</p>
          </div>
        )}
      </section>

      {/* Finding somebody to address. The same search the People tab runs, and
          the same two questions it may be able to answer -- said here too,
          because typing half an address and getting nothing reads as the person
          not existing. */}
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
              // The search is inside the publish form, so Enter here must run
              // the search rather than send a half-written memory.
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
          />
          <Button type="button" size="sm" disabled={searching || !q.trim()} onClick={() => void search()}>
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

      {error && <Alert severity="error">{error}</Alert>}

      <div>
        <Button type="submit" disabled={!ready}>
          <Send size={14} aria-hidden /> {sending ? t.mangrove.publishing : t.mangrove.publishAction}
        </Button>
      </div>
    </form>
  );
}
