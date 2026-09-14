# lighter-panes-and-document-type

**Status:** Specified. 2026-09-13.
**Amends:** `chat-shell-redesign` FR-6, which set out to remove the hairlines and left
the sidebar and the right pane half-done. This finishes that sweep with a rule sharp
enough to apply mechanically, and fixes two ways the file preview disagrees with the
chat about how a document looks.

## The three reports

> reduza ao máximo as linhas de borda horizontais, usando diferença em tipografia e tons
> de texto e espaçamento para destacar sessões diferentes e grupos diferentes
>
> na aba arquivos, a estilização de arquivos como docx e tabelas divergem em estilização
> de markdown que é a referência
>
> as pré-visualizações do markdown estão com cor de texto diferente do chat central

## 1 — The rules that are left, and the rule for keeping one

`chat-shell-redesign` FR-6.0 counted **136** `border-brand/*` hairlines at six opacities,
and FR-6.1 replaced them with a principle: *a hairline survives only where two surfaces
of the same tone meet and the boundary carries meaning.* "Carries meaning" was never made
checkable, so the sweep stopped where judgement ran out. Eighteen horizontal rules are
left in the sidebar and the right pane.

**FR-1.0 — The rule, made checkable: a horizontal rule survives only where content
SCROLLS PAST IT.** A header pinned above a scroller, a status bar pinned below one — the
rule is what tells the member the region does not move with the content, and no amount of
spacing says that. Everywhere else — a group separator, a section heading in a stack that
scrolls as a unit, a separator between repeated rows — it is drawn weight doing a job
that type, tone and space already do.

That rule is mechanical, so the next component cannot invent a nineteenth by arguing it
is special.

### FR-1.1 — What goes, and what replaces it

| Where | Today | Replaced by |
|---|---|---|
| `sidebar-section.tsx:29` — the conversation list's header row | `border-t border-rule` | space above the row; the label already carries `font-medium text-fg-muted` against `text-fg` rows |
| `unified-sidebar.tsx:161` — admin/install group | `border-t border-rule` | space; the group is two quiet rows under the list |
| `history-sidebar.tsx:376` — a row's actions, below `md` | `border-t border-rule` | nothing; the actions already sit inside the row's own hover surface |
| `scheduled-tasks-panel.tsx:54` — task row | `border-b border-rule` in the row cva | space between rows plus the row's existing hover |
| `scheduled-tasks-panel.tsx:296, 346, 351, 380` — stacked blocks inside the scroller | `border-b border-rule` | space; each block already leads with its own label |
| `scheduled-tasks-panel.tsx:419, 535` — `<section>` wrappers | `border-b border-rule` | space between sections |
| `memory-graph-tools.tsx:559` — tool sections | `border-t border-rule first-of-type:border-t-0` | space; each section leads with a heading |
| `memory-graph-views.tsx:43` — entity row | `border-b border-rule` in the row cva | `space-y-1` on the list plus the row's rounded hover |
| `memory-graph-views.tsx:119` — the type-chip row | `border-b border-rule` | space |

### FR-1.2 — What stays, and why each one passes FR-1.0

| Where | Why |
|---|---|
| `unified-sidebar.tsx:168` — account footer | the conversation list scrolls under it |
| `workspace-pane.tsx:143` — pane header | the panel body scrolls under it |
| `scheduled-tasks-panel.tsx:273` — panel toolbar | the task list scrolls under it |
| `file-preview.tsx:375` — the rendered/source tabs | `sticky top-0`, and the document scrolls under it |
| `file-preview.tsx:525` — sheet tabs | the grid scrolls under it |
| `file-preview.tsx:561` — the truncation notice | the grid scrolls above it |

**FR-1.1.1 — A removal from a REPEATED row is not done until the space is added.** Six of
the sites above are one-offs where the surrounding layout already supplies a gap; three
are row separators in a list (`scheduled-tasks-panel`'s runs, `memory-graph-views`'
entities, and its type chips). Internal padding is not a boundary: a list whose rule is
removed and nothing put in its place is a wall of flush rows with nothing to read at
rest. Those three get `space-y-1` on the list and a rounded hover on the row, so the gap
is BETWEEN rows rather than padding the ends of the list.

### FR-1.3 — Typography and tone do the separating

Where a rule is removed, the boundary is carried by what is already there and is made
explicit rather than assumed: a group's heading keeps `text-fg-muted` against its rows'
`text-fg`, and the space above a heading is larger than the space between its rows. No
new type scale, no new token — FR-6.4 stands, nothing is deleted and nothing is invented.

### FR-1.4 — Out of scope

The **centre pane**. The report was about the sidebar and the pane beside the
conversation; `workspace-grid`'s heading rule and the composer's popover divider are the
same case in a place this diff does not reach. Both are listed in the test **with their
counts** rather than skipped, so the pass that does reach them starts from a number
instead of a survey.

Bordered **boxes** — cards, inputs, chips, popovers — are not horizontal rules and are
untouched. So is `/admin`: FR-7.1 says the two halves wear the same grammar, and applying
this there is a second pass with its own diff.

## 2 — The file preview agrees with the chat about documents

`message-content.tsx`'s `COMPONENTS` table is the reference (DEC-3 already says so). Three
divergences, verified against the code rather than assumed — the `text-[0.9em]` on docx
tables, which looks like one, is **not**: `MarkdownTable` sets exactly the same size.

- **FR-2.1 — The spreadsheet grid is a different grammar entirely.** `file-preview.tsx`'s
  sheet cells are `border border-rule px-2 py-1 text-xs`; the markdown table's are
  `border-current/15 px-3 py-2` at `text-[0.9em]`. `--rule` is a brand-tinted boundary for
  chrome; a document's grid is drawn in its own text colour, which is what lets it read on
  any surface. The grid adopts the markdown cell's tokens.
- **FR-2.2 — A docx table has no header tint.** Markdown's has
  `[&_thead_th]:bg-current/[0.05]`. Nothing about `border-collapse` prevents it.
- **FR-2.3 — A docx table's cells do not wrap.** Markdown's carry
  `[overflow-wrap:break-word]`, so a long unbroken value spills out of the docx column.
- **FR-2.4 — Table spacing.** Markdown's wrapper is `my-4`; docx's table is `mb-2`.

**The `border-collapse` departure stays**, and its reason stays with it: the markdown
table's rounded outer corners come from `border-separate` plus edge rules that assume a
`<thead>`, which a docx table frequently has none of. The cell **width clamps**
(`min-w-[7rem] max-w-[32rem]`) stay out too, and that is a decision rather than an
oversight: markdown's table sits in an `overflow-x-auto` wrapper that can scroll, and the
docx body is one injected tree with no per-table wrapper to give one.

## 3 — One reading colour

**FR-3.1** The chat's message band is
`text-fg dark:text-[#c9c7be]` — a one-off hex, used in exactly one place in the
repository, warmer than dark `--fg` (`#e6eef2`). Every preview uses plain `text-fg`, so in
dark mode a document reads cooler and brighter than the same content in the chat. It
becomes a token, `--reading-fg`, exposed as `text-reading-fg`.

**FR-3.2** Both surfaces read it: the chat's message band, and the preview's markdown,
word-processor, plain-text and spreadsheet bodies.

**FR-3.3 — Deliberately not reached.** The **code** preview, whose colours belong to the
highlighter and would fight a body colour; and the **HTML** preview, which is a
`srcdoc` iframe — a separate document that inherits nothing, and whose `sandbox=""` is
the reason it is allowed to exist at all.

## Acceptance

| # | Check |
|---|---|
| FR-1.0 | a test names the surviving set, so a nineteenth rule fails it |
| FR-1.1 | none of the nine listed sites renders a horizontal rule |
| FR-1.1.1 | the three row lists gained the space that replaced their separators |
| FR-1.2 | each of the six survivors still renders one |
| FR-2.1 | the sheet cell and the markdown cell share their border token and padding |
| FR-2.2–2.4 | the docx table carries the header tint, the wrap and the spacing |
| FR-3.1 | the hex is a token; no component carries `text-[#c9c7be]` |
| FR-3.2 | the chat band and the document bodies resolve to the same colour class |
