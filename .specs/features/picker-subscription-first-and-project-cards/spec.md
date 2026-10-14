# The picker leads with the subscription, and Projects leads with three cards

## The request

> On `/chat` with no agent chosen, the list is agent-oriented and the agent is the main
> piece of information. Reorder the columns so the subscription is the main information,
> followed by the tenant, then the agent. Then, on the projects tab (`v=projects`), always
> show the three most recent projects — including "No project", which is now called
> "Global chats" — as cards in columns, and the remaining projects as rows in a data table
> like the agent picker's.

## FR-1 — The agent picker reads subscription, tenant, agent

`workspace-grid.tsx` keeps one row per agent; what changes is which fact leads it.

- **FR-1.1** The columns are, in order: Subscription, Tenant, Agent. The header labels
  follow the same order.
- **FR-1.2** The subscription takes the primary treatment the agent had: the leading
  initials avatar is the subscription's name, and the cell is the bold display text. The
  agent drops to the muted secondary style the subscription had.
- **FR-1.3** The "subscription not set up yet" marker stays on the subscription cell
  (its placement argument is unchanged — `scaffolded` is the subscription's directory).
- **FR-1.4** Rows are ordered by subscription name, then tenant name, then agent, so rows
  of one subscription sit together now that it is the column a member scans first.
- **FR-1.5** On a phone the stack reads in the same order; the primary line carries no
  label prefix, and the two secondary lines carry theirs (`Tenant:`, `Agent:`).
- **FR-1.6** The tenant and agent cells are `text-sm` in the primary text colour (they
  were `text-xs` muted), so both read at a glance; the subscription steps up to
  `text-base` to stay the lead.

Clicking a row is unchanged: it enters `(t, s, r)` and creates no conversation.

## FR-2 — Projects: three cards, then a table

`projects-screen.tsx`.

- **FR-2.1** "No project" is renamed **Global chats** (`Chats globais`). The sidebar's
  heading over the same conversations (`history.globalChats`, today "General chats" /
  "Conversas gerais") takes the same name, so one set of chats has one name.
- **FR-2.2** A row of up to three cards, in columns from `sm` (stacked on a phone):
  Global chats first, always, then the two newest projects.
- **FR-2.3** "Newest" is `createdAt`, descending, with an empty `createdAt` sorting last —
  the order the screen already uses. DEC-11 of `chat-shell-redesign` still holds: nothing
  tracks last activity, so recency is creation.
- **FR-2.4** Every project not in a card is a row in a table below, styled like the agent
  picker (header row of column names from `sm`, one bordered row per project). Columns:
  Name, Instructions (one truncated line), Created. Edit and delete stay at the row's end.
- **FR-2.5** The table renders only when there are more than two projects; there is no
  empty table.
- **FR-2.6** Cards keep everything rows had: the `Current` marker and `aria-current`, the
  date when there is one, and edit/delete for project cards (not for Global chats).
- **FR-2.7** With no projects at all the Global chats card still renders, with the
  existing "No projects yet" copy below it.
- **FR-2.12** Both the cards and the table respond to the PANE's width, not the
  window's: the cards are an `auto-fit` grid of columns at least 15rem wide (three, two,
  one), and the table's columns switch on a container query (`@xl`). The screen sits
  beside the sidebar, so a viewport breakpoint kept three cards abreast in a narrow pane.
- **FR-2.8** The screen widens from `reading` to `full`: three cards side by side and a
  three-column table are the shape `full` exists for.
- **FR-2.9** The Global chats card has a dashed edge: it is not a project.
- **FR-2.11** The project the member is in is marked three ways: a solid accent badge
  with a check, an emphasis edge thickened by a 1px ring, and the raised background, with
  its folder icon in the accent.
- **FR-2.10** Editing a project opens a mini modal hanging from the bottom of that
  project's card or row (`role="dialog"`), not the form at the top of the screen. Escape
  or a click outside cancels. Creating a project keeps the form at the top.

Creating, deleting, the restart notice and the silence on
`projects_unsupported` are unchanged.

## FR-3 — Neutral borders, from tokens only

The owner, 2026-10-13: many elements use blue and violet borders; borders become neutral
throughout, light and dark, and the colour lives in one place.

- **FR-3.1** `--rule` and `--rule-strong` are mixed from `--fg` instead of the violet
  `--brand`, so they are neutral and flip with the scheme on their own.
- **FR-3.2** A third token, `--rule-emphasis`, replaces every cyan or violet edge that
  marked hover, the current or selected item, an active tab or a focused field.
- **FR-3.3** Keyboard focus rings use `--focus` / `--focus-soft`, which stay on the
  accent: a neutral focus ring disappears against neutral borders. One line in
  `globals.css` changes it.
- **FR-3.4** No component names a hue for a border, ring or outline. Enforced by
  `app/border-tokens.test.ts` over source text.

## Out of scope

- A "last active" date for projects (needs the proxy to track it).
- Sorting or filtering the table.
