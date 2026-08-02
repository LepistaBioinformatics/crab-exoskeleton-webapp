# landing-refresh-memory-graph — spec

Bring the landing page up to date with what the product actually does now: the
knowledge-graph memory served by a native MCP server, and member-driven
organisation of the uploads tree.

Scope: **Medium** — copy in two locales, one new section, one new figure, and a
renumbering. No new architecture.

Prior art that constrains this: `landing-page-and-i18n` (memory note) fixed the
accuracy limits on the existing claims. One of them has aged and is corrected here.

## Problem

The landing was written before the knowledge graph existed. It describes memory as
conversation aliases/tags/colors, and files as "drop one in, find it by name" —
which is still true but no longer the whole story. The strongest capability added
since is invisible on the page.

## Functional requirements

### FR-1 — A section for the knowledge graph

- **FR-1.1** New section, placed at **03**, immediately after "Memory you control".
  Both are memory; the existing one is about organising *conversations*, the new one
  about what the agent learns *on its own*. Sections 03–07 shift to 04–08, and the
  `next` chain and `#sN` anchors move with them.
- **FR-1.2** It says three things, all of which are true:
  1. the agent builds a graph of entities, relations and observations by itself;
  2. it is served by an MCP server **inside the gateway** — no extra container, no
     external service, no embedding model to download;
  3. the member can **read and audit** it, including which conversation each fact
     came from.
- **FR-1.3** A figure in the same idiom as the other mocks (`GraphMock`), showing an
  entity with its type, an observation and a link — not a node-link diagram (see
  NFR-1).

### FR-2 — The files section reflects real organisation

- **FR-2.1** Extend section `files` (now 08): folders can be created, renamed,
  moved and deleted, and files and folders are dragged between them.
- **FR-2.2** Keep the existing, still-true claims: attach from the composer, the
  agent reads by path, the bytes never enter the chat, admins cascade shared files
  read-only.

### FR-3 — Both locales

- **FR-3.1** Every new string exists in `en` and `pt`, and no leaf is identical
  across them unless whitelisted — `lib/i18n/parity.test.ts` is the gate.

## Accuracy limits on the NEW claims

These are the point of the spec, not a footnote. Each is grounded in the code, and
each is a thing the page could easily imply and must not.

- **NFR-1 — Do NOT show or imply a node-link graph.** The interface is a browsable
  list with a detail pane. A force-directed picture would promise a view that does
  not exist. The figure shows a record, not a network.
- **NFR-2 — Do NOT call the search semantic, neural, AI-powered, or
  embedding-based.** It is **BM25 lexical ranking** (`memgraph/search.go`). The tool
  is *named* `semantic_search` for upstream compatibility and its own description
  says lexical; the landing has no such excuse.
- **NFR-3 — Do NOT imply team or shared memory.** The graph is scoped per
  `{tenant, subscription, agent, user}` — a member's `alpha` graph and `beta` graph
  are different graphs, and two members share nothing. Say "your agent", never
  "your team's knowledge".
- **NFR-4 — Do NOT claim every fact links back to a conversation.** Provenance is
  recorded only when exactly one turn is in flight; a scheduled job, the heartbeat,
  or two chats open at once produce none. Say "when it can be traced".
- **NFR-5 — Do NOT say the member curates the graph.** The UI is read-only in v1:
  the agent writes, the member inspects. No archive/delete/merge from the interface.
- **NFR-6 — Do NOT promise the agent always uses it.** Choosing the graph over its
  own `MEMORY.md` depends on instructions the platform now ships by default. Phrase
  it as what the agent does, not as a guarantee.

### Corrected from the earlier accuracy note

The `landing-page-and-i18n` note says *"No full-text/content search, no category
filter in the library."* Half of that has aged:

- **Still true**: uploads search is filename-substring only. There is no full-text
  search over file CONTENT, and the page must not imply one.
- **Now false**: the knowledge graph does have a text-ranked search (BM25) over
  entities and observations, and the graph browser does have a filter by entity
  type. That is a different surface from the file library — the distinction has to
  survive into the copy, or the page will read as promising file-content search.

## Out of scope

- Retrofitting the rest of the app for i18n (the landing is still the only
  translated surface).
- A graph visualisation, on the page or in the app.
- Any claim about the file-management API beyond what the interface offers.
