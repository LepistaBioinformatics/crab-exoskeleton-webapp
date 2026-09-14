# shell-path-and-landing

**Status:** Specified. 2026-09-13.
**Predecessor:** `chat-shell-redesign` (#65) built the path bar, the single sidebar and
the collapsed rail. This is four corrections to it, reported by the owner from use.

## The problem, in the owner's words

> o breadcrumb está fora de ordem; na raiz, sem projeto selecionado, ele me dá a opção
> de renomear ou excluir o agente, o que não é possível; quando eu entro num projeto eu
> devo ver o chat para iniciar um novo e abaixo uma lista com busca, tudo na tela
> central; na sidebar recolhida, no hover, mostre somente as conversas.

Four reports, three causes, one of which is not a rendering bug at all.

## What is actually happening

**The path inverts the containment.** `crumbs.ts` builds the projects screen as the LAST
segment: `const leaf = destination ? t.projects.title : conversationTitle`. So standing
in a project and asking for the list reads `assinatura · agente / MeuProjeto / Projetos`
— the list rendered as a child of a project it contains. The same inversion shows up as
navigation: `onProject: () => setDestination("projects")` means clicking the project's
own name lands on the list of projects.

**The chevron is guarded by the wrong fact.** `Breadcrumb` takes `sessionId` and assumes
the last crumb names it — its own prop comment says so — but nothing enforces it. The
shell passes `destination === null && sessionId ? sessionId : null`, which is a different
claim: that no destination is open.

The two come apart deterministically, and this is the root of report 2.
`createConversation` (`lib/chatSession.ts:118`) **mints an id client-side without
persisting anything** — the row is created lazily on the first sent message, so a ghost
row never outlives a conversation nobody wrote in. `ChatView`'s effect at line 516 mints
one whenever `sid` is absent. So on entering an agent: `sid` is set, the conversation is
NOT in `listConversations`, `conversationTitle` is `null`, `buildCrumbs` emits no leaf —
and the chevron renders beside the **agent** crumb, offering to rename and delete
something the menu cannot act on. Not a race: it stays that way until the first message.

**Entering a place mints an empty conversation.** That same effect is why entering a
project drops the member into a blank transcript instead of a place with things in it.
The comment above it is a warning worth keeping: a conversation minted without the
project is answered by the main agent and its history is read from the wrong workspace.

**The hover preview is the whole sidebar.** `ResizablePane`'s peek slides the same
`UnifiedSidebar` in, destinations and footer included, while the rail beside it already
offers those same destinations as icons. The member is shown the menu twice and the
conversations once.

## Requirements

### FR-1 — The path states containment, in order

- **FR-1.1** A project is reached THROUGH the projects list, and the path says so:
  `assinatura · agente / Projetos / MeuProjeto / <folha>`.
- **FR-1.2** `Projetos` carries the link to the projects list. The project's own crumb
  does not: it links to the project's landing (FR-3), which is where "go back up to this
  project" means.
- **FR-1.3** On the projects list with a project open, the project is the last crumb —
  no link, `aria-current="page"`. The list is where the member came through; the project
  is where they are, and the grid marks it.
- **FR-1.4** On the projects list with no project open, the path ends at `Projetos`.
- **FR-1.5** `Projetos` appears only when there is a project to contain or a list being
  looked at. An agent with no project open and no list showing reads
  `assinatura · agente / <folha>`, unchanged.

### FR-2 — The conversation menu acts on a conversation, or is absent

- **FR-2.1** The chevron renders only when the last crumb IS the open conversation.
  The condition moves into `Breadcrumb` from the shell, because the component is what
  knows which crumb is last.
- **FR-2.2** A conversation that exists only as a minted id — no row, no title — names no
  leaf, so it offers no menu. This is the state FR-3 removes; the guard stays anyway,
  because the menu's correctness must not depend on the landing existing.

### FR-3 — The landing: start one, or pick one

- **FR-3.1** A workspace with no `sid` shows a LANDING in the centre, at the agent root
  and inside a project alike. One state, one answer.
- **FR-3.2** The landing holds a composer. Sending from it is what starts the
  conversation.
- **FR-3.3** Below the composer, the conversations of the current scope — the project's
  inside a project, the agent's at the root — each row opening the conversation.
- **FR-3.4** A search box above that list, accepting the same query grammar the sidebar's
  does (`tag:`, `alias:`, `text:`, `date:`), and reusing the same parser.
- **FR-3.5** **No conversation is created until the member sends.** `ChatView`'s
  auto-mint effect goes; the landing is what stands in the state it existed to fill.
- **FR-3.6** **A conversation born on the landing carries the project.** This is the
  invariant the deleted effect's comment protects, and it survives the deletion: a
  conversation minted without `p` is answered by the main agent and reads its history
  from the wrong workspace.
- **FR-3.7** Deleting the open conversation lands on the landing rather than on a fresh
  blank chat.

### FR-4 — The collapsed sidebar previews conversations, not the menu

- **FR-4.1** While the sidebar is collapsed, the hover preview shows the new-chat action,
  the conversation search and the conversation list.
- **FR-4.2** The destination rows — Projetos, Memória, Grafo, Tarefas, Arquivos, Segredos
  — render in the sidebar only while it is expanded.
- **FR-4.3** While collapsed, the rail's icons remain the way to change section.
  **Verified, not built** — `railDestinations` already wires every row to
  `setRightSidebar`/`setDestination`, and `rail-destinations.test.tsx` passed against
  unchanged production code. It is a test because FR-4.2 makes the rail the only way in
  while collapsed, and that claim had nothing holding it.

## Non-goals

- **Steering, and anything about turns.** Untouched.
- **The five section panes.** They keep opening beside the conversation under `rs`; the
  2026-09-12 reversal stands.
- **The sidebar's own conversation list.** It keeps its rename, delete, tags and tree
  view. The landing's list opens conversations and nothing else — the two surfaces are
  not one component pretending to be two.
- **Rewriting `HistorySidebar`.** The landing reuses the search bar and the filter
  module, which are already separate, and not the sidebar's row chrome.

## Acceptance

| # | Check |
|---|---|
| FR-1.1–1.2 | `buildCrumbs` places `Projetos` before the project, and only `Projetos` links to the list |
| FR-1.3–1.5 | the four combinations of `p` and `v` produce the four paths above |
| FR-2.1 | with a workspace open and no conversation, the bar renders no chevron |
| FR-2.2 | a `sid` absent from the conversation list produces no leaf and no chevron |
| FR-3.1 | `resolveCentre` answers `landing` for a workspace with no `sid`, with and without `p` |
| FR-3.5 | mounting `ChatView` without a `sid` creates nothing |
| FR-3.6 | a send from the landing inside a project creates the conversation with that project |
| FR-4.1–4.2 | the sidebar renders destinations expanded and omits them collapsed |

## Open questions

**OQ-1 — What does the landing's composer do with attachments?** `Composer` takes a
`sessionId` and uploads against it, and on the landing there is no conversation yet. The
first implementation disables the attach control there; whether a first message should be
able to carry a file is a separate decision.
