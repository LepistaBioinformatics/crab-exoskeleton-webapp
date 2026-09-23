"use client";

import { useState } from "react";
import { FileText, Network, Send, X } from "lucide-react";
import type { Workspace } from "./fragment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import {
  publish,
  MangroveError,
  type MangroveCapabilities,
  type MangroveMediaType,
  type MangrovePublication,
} from "@/lib/mangrove";
import AudiencePicker, {
  audienceFor,
  failureText,
  offeredScopes,
  resolveScope,
  type AudienceScope,
  type Recipient,
} from "./mangrove-audience";
import type { MangroveShare } from "./mangrove-share-bus";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// Writing something into the mangrove, as yourself.
//
// WHO READS IT IS ASKED BY `mangrove-audience`, not here. The same question is now
// asked by a post being passed on, and the rule about which scopes this member may
// give belongs in one place rather than two.
//
// NO AUDIENCE IS A REAL ANSWER, and it is this form's alone: both lists empty
// publishes privately to the author -- a note this member's own agent keeps and
// nobody else sees. The form says so rather than blocking the button until somebody
// is picked. Re-sharing has no such answer, which is why the scopes on offer are a
// parameter of the picker and not a constant inside it.
//
// AN ATTACHMENT REPLACES THE BODY, IT DOES NOT SIT BESIDE IT. The mangrove takes
// exactly one of prose, a file and a set of entities, and refuses zero or two with a
// 400 -- which a member would meet only after writing something and pressing Share.
// So when a file or a selection arrives from the files tab or the graph, the cell and
// body fields are not disabled, they are GONE: what is left on screen is what will be
// sent, and the way to write prose instead is to remove the attachment.
//
// THE FORMAT IS CHOSEN BEFORE THE BODY IS WRITTEN. It sat under the box, which is
// after the decision it governs has already been made -- somebody who writes plain
// text with asterisks in it has published it as markdown by the time they reach the
// control. Above the box it is part of deciding what to write, and markdown is what
// it is set to until somebody says otherwise.

const selectClass =
  "h-9 rounded-lg border border-rule-strong bg-elevated px-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

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
  // ONE SCOPE, NOT THREE BOOLEANS. Two flags and a list could all be on at once,
  // and "who reads this" is a single answer -- so the exclusivity is the type
  // rather than something the handlers have to keep agreeing about.
  const [chosen, setScope] = useState<AudienceScope>("private");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const audience = audienceFor(scope, workspace, recipients);
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
  // Publishing is the one place "only you" means something, so it is offered here.
  const offered = offeredScopes(caps, true);
  const scope = resolveScope(chosen, offered);

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
                title={
                  attachment.kind === "file" ? attachment.path : attachment.names.join(", ")
                }
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

          <div className="flex flex-col gap-3">
            {/* The media type travels with the memory. The preview renderer reads it
                and only sniffs the body when it is absent, so saying "plain text"
                here is what stops a body full of asterisks being rendered as
                emphasis for every reader afterwards -- which is why the choice is
                made BEFORE the box, not under it.

                ITS HEADING SITS ABOVE IT, like every other field on this form. It was
                the one label rendered inline -- muted, beside its control -- so the
                form read as three fields and a stray setting, and the eye running down
                the headings skipped the one decision made before anything is typed.
                `self-start` because a dropdown with two options has no reason to be as
                wide as the box below it. */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-fg">{t.mangrove.formatLabel}</span>
              <select
                className={`mt-1 self-start ${selectClass}`}
                value={mediaType}
                aria-label={t.mangrove.formatLabel}
                onChange={(e) => setMediaType(e.target.value as MangroveMediaType)}
              >
                <option value="text/markdown">{t.mangrove.formatMarkdown}</option>
                <option value="text/plain">{t.mangrove.formatPlain}</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-fg">{t.mangrove.bodyLabel}</span>
              <Textarea
                className="mt-1 min-h-40 rounded-lg border border-brand bg-elevated px-3 py-2"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t.mangrove.bodyPlaceholder}
              />
            </label>
          </div>
        </>
      )}

      <AudiencePicker
        workspace={workspace}
        offered={offered}
        scope={scope}
        onScope={setScope}
        recipients={recipients}
        onRecipients={setRecipients}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <div>
        <Button type="submit" disabled={!ready}>
          <Send size={14} aria-hidden />{" "}
          {sending ? t.mangrove.publishing : t.mangrove.publishAction}
        </Button>
      </div>
    </form>
  );
}
