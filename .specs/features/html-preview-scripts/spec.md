# html-preview-scripts

**Status:** Specified. 2026-09-13.
**Owner decision:** session-wide, not per file (DEC-1).

## The ask

> Torne essa opção uma opção do usuário. Se ele quiser ativar poderá porém deve nunca
> permanentemente, somente na sessão atual. Se fechar o navegador a config se perde. Caso
> o usuário ligar ele deve ser avisado dos riscos.

## What is true today

`file-preview.tsx` renders HTML as `<iframe sandbox="" srcDoc={text}>`. `sandbox` with no
tokens is the most restrictive value there is: no scripts, no same-origin, no forms, no
navigation, no popups. CSS and images work, which is what "rendered" has to mean.

The bytes were written by an agent that reads untrusted material — web pages, uploaded
files, a member's own paste — so this is not a theoretical threat model. It is why the
pane showed HTML as source before it showed it at all.

## Requirements

### FR-1 — The switch

- **FR-1.1** The HTML preview offers to run scripts. Off by default, always.
- **FR-1.2** Turning it on sets `sandbox="allow-scripts"` on the frame, and **never**
  `allow-same-origin`. The two together undo the sandbox entirely — the frame could reach
  into this origin and remove its own `sandbox` attribute. This is the one combination
  that is refused outright, whatever any future request says.
- **FR-1.3** With `allow-scripts` alone the frame has an **opaque origin**: scripts run,
  and cookies, `localStorage`, the parent DOM and top-level navigation stay unreachable.

### FR-2 — It cannot outlive the browser

- **FR-2.1** The setting lives in **`sessionStorage`**, not `localStorage`. It survives a
  reload and a navigation within the tab, and is gone when the tab or the browser closes.
  There is no server-side persistence and nothing is written to the member's account.
- **FR-2.2** Every read and write is wrapped: `sessionStorage` throws in a private window
  and where site data is blocked, and the preview must render correctly — with scripts
  OFF — when it does. A storage failure is never an error the member has to read.
- **FR-2.3** Turning it **off** is available wherever it is on, and takes effect at once.

### FR-3 — Turning it on is informed, and it is one decision for the session

- **FR-3.1** The switch does not flip on a click. A confirmation names what the member is
  agreeing to, in their own language, and it says the four things that are true:
  - the page may send the document's contents to any address on the internet;
  - it may reach hosts their browser can see and this deployment cannot;
  - their session, cookies and the rest of the app stay out of its reach;
  - **it applies to every HTML file opened for the rest of this session**, including ones
    the agent downloads later.
- **FR-3.2** The confirmation is a `danger`-toned dialog, the tone this app reserves for
  an action that reaches beyond the person taking it.
- **FR-3.3** While scripts are on, the preview says so — quietly, and permanently, with
  the way off beside it. A member who confirmed once, ten minutes ago, must not have to
  remember.

### FR-4 — DEC-1, and what it costs

**Session-wide, chosen by the owner over per-file**, after the trade was put to them: an
HTML the agent generated and an HTML it scraped arrive in the same files tab and cannot be
told apart by looking, so one confirmation now covers documents the member has not seen
yet. The cost is stated in FR-3.1's fourth bullet rather than left implicit, and FR-3.3 is
what keeps it from being forgotten.

### FR-5 — Not in this change

- **No Content-Security-Policy.** It is the thing that would close the exfiltration
  channel, and `next.config.ts` and `middleware.ts` set none — a `srcdoc` frame inherits
  the embedder's CSP, so there is nothing to inherit. A `<meta http-equiv>` injected into
  the `srcDoc` is **not** a substitute worth shipping on a guess: it is markup placed
  inside markup the agent wrote, and getting the insertion point wrong against a document
  with its own `<head>`, its own doctype, or a `<script>` before ours yields a policy that
  looks enforced and is not. False assurance is worse here than none, because the member
  is reading a warning that would then be wrong. A header-delivered CSP, measured against
  real documents, is the follow-up.
- **The code preview and the source view** are unaffected: neither runs anything.

## Notes from building it

**One mount site.** `FilePreview` is rendered only by `files-screen.tsx`; no chat
attachment path mounts it, so the strip appears exactly where this spec says and nowhere
else. Verified rather than assumed.

**`tooLarge` and `error` never reach the frame.** Both leave `text` null, and the HTML
branch is guarded on it — so a "scripts are off" notice never sits over an error message.

**The document parses twice in an enabled session.** The setting is read in an effect
(the server render has no `sessionStorage`), so the frame paints once restricted and then
remounts. Accepted: the extra pass is in the safe direction, and `useSyncExternalStore`
would not remove it — a server snapshot has no storage to read either.

## Acceptance

| # | Check |
|---|---|
| FR-1.1 | a fresh session renders `sandbox=""` |
| FR-1.2 | no reachable state renders `allow-same-origin` |
| FR-1.3 | enabled renders exactly `sandbox="allow-scripts"` |
| FR-2.1 | the switch writes `sessionStorage` and never `localStorage` |
| FR-2.2 | a throwing `sessionStorage` renders the preview with scripts off |
| FR-3.1 | the confirmation carries all four statements, in both locales |
| FR-3.3 | the on-state renders its notice and its way off |
