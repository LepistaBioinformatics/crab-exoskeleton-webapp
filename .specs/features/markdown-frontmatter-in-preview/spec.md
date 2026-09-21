# Frontmatter reads as metadata, not as the document

## The request

> When rendering markdown files in the preview, render the frontmatter too, in a
> distinguished way, so the user can tell it is frontmatter and not part of the markdown
> content. This will be useful when the user reviews skills.

## What the survey found

The frontmatter is not lost today. It is rendered — as the document.

`app/chat/message-content.tsx:250` runs `react-markdown` with `remarkPlugins={[remarkGfm]}`
and no rehype plugins. Given a `SKILL.md`, that plugin set produces:

```
---                              ->  thematicBreak      (an <hr>)
name: pdf                        \
description: Use this for PDFs   /   heading depth 2    (an <h2>, both lines inside it)
```

So a member opening a skill sees a rule and a large heading reading
`name: pdf description: Use this for PDFs`, sitting above the real `# PDF skill`. It is
the most prominent thing on the page and it is the one part that is not the document.

### The renderer is shared, so the fix cannot live in it

`MessageContent` is the chat transcript's renderer. `file-preview.tsx:465` reuses it, and
so do `chat-view.tsx` (six call sites), `scheduled-tasks-panel.tsx:732` and
`markdown-editor.tsx:189`. Handling frontmatter inside it would change all of them — and
an assistant message that opens with `---` is a valid thematic break, which is how a model
often starts a section. Turning that into a metadata card in the transcript is a
regression with no request behind it.

Two further constraints inside that file, both pinned by
`message-content-remount.test.tsx`: `REMARK_PLUGINS` and `COMPONENTS` must stay module
constants (inline ones remounted the subtree and lost table scroll position), and the
component is `memo()`-wrapped on the premise that both props are primitives.

### A parser is not available and not needed

There is no YAML parser anywhere in `node_modules` — not `js-yaml`, not `gray-matter`, not
transitively. Adding `remark-frontmatter` alone would make the block *disappear* rather
than render, since `remark-rehype` has no handler for a `yaml` mdast node.

It is also not the grammar this stack uses. The proxy's `parseSkillFrontmatter`
(`crab-shell-proxy/internal/docker/skills.go:59-97`) and the harness's
`skillfile.Frontmatter` both refuse a YAML dependency on purpose and read exactly this:
a leading `---` line, `key: value` lines, a closing `---`. A third grammar in the webapp
would disagree with the two that decide whether a skill loads at all.

## FR-1 — The preview splits the document before rendering it

`file-preview.tsx` separates a leading frontmatter block from the body, renders the block
itself, and passes only the body to `MessageContent`.

A pure function in `lib/`, so it is unit-testable without a DOM and so the preview stays a
component. `MessageContent` is not modified and receives no new prop.

## FR-2 — The grammar is the one the rest of the stack already uses

Agreeing with `parseSkillFrontmatter`:

- leading whitespace and a BOM are skipped; the first content line must trim to exactly `---`
- the block closes at the first subsequent line that trims to `---`
- a row splits on its **first** `:`; the key is trimmed, the value is trimmed and then
  stripped of one layer of matching `"` or `'`

Two departures, both because this renders rather than validates:

- **Every line is shown.** `parseSkillFrontmatter` keeps `name` and `description` and
  ignores the rest; a reviewer needs to see the field that is not being read, which is
  exactly the mistake they are reviewing for.
- **A line with no `:`** is kept verbatim as its own row rather than dropped, for the same
  reason.

## FR-3 — No closing fence means there is no frontmatter

A document that opens with `---` and never closes it is rendered whole, exactly as today.
Eating an unterminated block would hide an arbitrary amount of the document, and the
failure would be silent: the member sees a shorter file and nothing says why.

Likewise a `---` that is not the first content line stays a thematic break. The block is
recognised at the top of the file or not at all.

## FR-4 — It is legible as metadata at a glance

The block renders above the document as a bordered, tinted panel with a label, its rows in
monospace as `key` and `value`. The body below keeps the typography it has today.

The distinction has to survive a glance, because the failure it fixes is a member reading
`name: pdf` as the document's first heading. A styled panel that still used the reading
typography would fix the semantics and not the complaint.

## FR-5 — Only the rendered view, only markdown

The source view already shows the frontmatter verbatim under the markdown grammar
(`file-preview.tsx:594-606`), which is correct for a view whose job is to show the marks.
It is unchanged.

The split applies to `kind === "markdown"`. HTML shares the dual toggle and has no
frontmatter.

## Deferred

- **DQ-1 — no validation.** The panel does not mark a skill whose `name` or `description`
  is missing, though that is what makes the proxy reject it. Showing a reviewer the fields
  is this feature; judging them is another, and it needs the proxy's rules, not a copy.
