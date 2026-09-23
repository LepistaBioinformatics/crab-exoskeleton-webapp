"use client";

import { useState } from "react";
import { Forward } from "lucide-react";
import type { Workspace } from "./fragment";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { shareWith, MangroveError, type MangroveCapabilities } from "@/lib/mangrove";
import AudiencePicker, {
  audienceFor,
  failureText,
  offeredScopes,
  resolveScope,
  type AudienceScope,
  type Recipient,
} from "./mangrove-audience";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// Passing a memory on to somebody who has not got it.
//
// OFFERED ON A POST THE MEMBER WROTE, which is a UI decision and not the rule the
// service enforces. The mangrove lets a RECIPIENT re-share within their own reach, by
// design -- what they may pass on is bounded by who they can address, not by whether
// they wrote it. Restricting the affordance to the author keeps the screen honest
// about provenance: a card says who produced it, and a control that let anybody
// forward anything would make that line harder to trust than it is worth. The service
// is the thing that decides; this is the thing that offers.
//
// "ONLY YOU" IS NOT ON THE LIST. Re-sharing to nobody is not an operation -- the
// memory is already the author's own -- so the scopes offered start at "people". That
// is why `offeredScopes` takes the question rather than assuming it.
//
// A GROUP NEEDS THE GOVERNING ROLE, exactly as publishing into one does, so the group
// options come from the same `capabilities` the composer reads. A refusal comes back
// in the mangrove's own words, naming the addressee that was out of reach, and that
// sentence is shown as it arrived.
//
// IT REPORTS ITS OWN FAILURE AND DOES NOT GO THROUGH THE SCREEN'S `run`. That helper
// replaces whatever came back with one generic sentence, and a refusal here is the
// mangrove naming the addressee that was out of reach -- the only thing the sender can
// act on. What it DOES borrow is the reload: the card's own record says who this
// memory reached, and this panel sits in the same footer -- so a share that left the
// reading as it was would print "Recipients: only you" beside the word "Shared."
//
// AND THE PANEL IS AN INNER CONTROL. The card opens a sheet when it is clicked, so
// everything in here is marked `data-inner` -- see `fromControl` in mangrove-post.

export default function MangroveShareAction({
  workspace,
  objectId,
  caps,
  onShared,
}: {
  workspace: Workspace;
  objectId: string;
  /** Null while the tab is still loading them: no group option until they arrive. */
  caps: MangroveCapabilities | null;
  /** Re-read the reading: this changed who the card above says it reached. */
  onShared: () => void;
}) {
  const t = useT(chatCopy);
  const [open, setOpen] = useState(false);
  const [chosen, setScope] = useState<AudienceScope>("people");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"ok" | "pending" | null>(null);

  const offered = offeredScopes(caps, false);
  const scope = resolveScope(chosen, offered);
  // Nothing to send to. The composer can publish to an empty audience because that
  // means "keep it myself"; here it would mean nothing at all.
  const ready = !sending && (scope !== "people" || recipients.length > 0);

  const send = async () => {
    setSending(true);
    setError(null);
    setDone(null);
    try {
      const out = await shareWith(workspace, objectId, audienceFor(scope, workspace, recipients));
      setDone(out.pending === true ? "pending" : "ok");
      onShared();
    } catch (err) {
      setError(failureText(err instanceof MangroveError ? err.code : "unknown", t));
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-inner>
      <Button
        type="button"
        size="sm"
        variant="text"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Forward size={14} aria-hidden /> {t.mangrove.shareOthers}
      </Button>

      {open && (
        <div className="mt-2 flex flex-col gap-4 rounded-lg bg-elevated p-3">
          <p className="text-xs text-fg-muted">{t.mangrove.shareOthersHint}</p>

          <AudiencePicker
            workspace={workspace}
            offered={offered}
            scope={scope}
            onScope={setScope}
            recipients={recipients}
            onRecipients={setRecipients}
          />

          {error && <Alert severity="error">{error}</Alert>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={!ready} onClick={() => void send()}>
              {sending ? t.mangrove.publishing : t.mangrove.publishAction}
            </Button>
            {done && (
              <span className="text-xs text-fg-muted">
                {done === "pending" ? t.mangrove.publishedPending : t.mangrove.publishedOk}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
