"use client";

import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { setHtmlScripts, useHtmlScripts } from "./html-scripts";
import { chatCopy } from "@/lib/i18n/chat";
import { commonCopy } from "@/lib/i18n/common";
import { useT } from "@/lib/i18n/context";

// THE ONE CONTROL over whether an HTML preview runs scripts, and the sentence a member
// agrees to before it does.
//
// A strip above the frame rather than a setting somewhere else, for the reason FR-3.3
// gives: the member who said yes did it once, possibly ten minutes and three documents
// ago, and must not have to remember. The state is on screen wherever the state applies,
// with the way out of it beside the statement of it.
//
// The dialog does NOT flip on a click. What it says is four things that are each true and
// each load-bearing -- what the page can do, what it cannot, and that the answer covers
// documents the member has not opened yet -- because a warning that overstates is one
// nobody reads the second time.
export default function HtmlScriptNotice() {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const scripts = useHtmlScripts();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-[11px] text-fg-muted">
        {scripts ? (
          <>
            <ShieldAlert size={13} className="shrink-0 text-notice" aria-hidden />
            <span className="min-w-0 flex-1">{t.preview.scriptsOn}</span>
            <Button size="link" variant="link" onClick={() => setHtmlScripts(false)}>
              {t.preview.scriptsDisable}
            </Button>
          </>
        ) : (
          <>
            <ShieldCheck size={13} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{t.preview.scriptsOff}</span>
            <Button size="link" variant="link" onClick={() => setAsking(true)}>
              {t.preview.scriptsEnable}
            </Button>
          </>
        )}
      </div>

      {/* `danger`, which this app reserves for an action that reaches beyond the person
          taking it. Turning this on is a decision about documents the member has not
          opened yet -- see the third line. */}
      <ConfirmDialog
        open={asking}
        tone="danger"
        title={t.preview.scriptsTitle}
        message={t.preview.scriptsRisk}
        detail={
          <>
            <p>{t.preview.scriptsSafe}</p>
            <p className="mt-2 font-medium">{t.preview.scriptsScope}</p>
          </>
        }
        confirmLabel={t.preview.scriptsEnable}
        cancelLabel={c.actions.cancel}
        onConfirm={() => {
          setHtmlScripts(true);
          setAsking(false);
        }}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
