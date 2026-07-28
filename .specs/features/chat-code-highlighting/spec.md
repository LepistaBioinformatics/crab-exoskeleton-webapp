# chat-code-highlighting — Specification

**Status:** Shipped. See "Reconciliation" at the end.
**Size:** Medium (one dependency, one new module, one new component, one prop)
**Repo:** `crab-exoskeleton-webapp` only. No proxy or gateway change.

---

## Problem

Fenced code in chat messages renders as undifferentiated monospace on a tinted
`<pre>` (`message-content.tsx`). The agent writes a great deal of code — Go, bash,
TypeScript, YAML, SQL — and every one of those blocks reads as a grey wall.

The admin JSON editor (`admin-instance-config-editor` FR-9) got a hand-written
tokenizer, a palette in `globals.css` and a role-keyed theme module. That was
scoped to JSON on purpose, and FR-9.9 recorded what a chat implementation would
additionally need: a grammar per language, and a decision about the streaming path.
This is that feature.

## Goal

Colour fenced code blocks in chat, across as many languages as possible, without
touching the reveal path's cost.

## Non-goals

- **No editing.** These blocks are read-only. Nothing here needs a caret, a
  selection model or a fold — which is why it is not the admin editor's overlay,
  and not CodeMirror.
- **No language auto-detection** for an unlabelled fence (DEFER-1).
- **No line numbers, no copy-per-line, no diff rendering.**
- The admin JSON editor is **not** re-implemented on top of this. It edits; this
  reads. They share only the palette.

---

## Why highlight.js and not CodeMirror

The request named CodeMirror. For a read-only, many-language surface it is the
wrong layer, and the numbers say so:

| Option | Read-only fit | Languages | Cost |
| --- | --- | --- | --- |
| `@codemirror/*` static highlight | `highlightCode` exists, but lives in `@codemirror/language`, which depends on `@codemirror/view` — the editor, 1.25 MB unpacked | one `lang-*` package each; `legacy-modes` (the wide set) needs `StreamLanguage`, so also the editor core | pulls an editor to paint text |
| `@lezer/*` grammars | good — `highlightTree`, no editor | ~15 first-party grammars | one package per language |
| **`highlight.js`** | **built for exactly this** | **384 grammars**, importable one file at a time | core 22 KB gzip; a language 0.5–7 KB gzip |
| `shiki` | TextMate fidelity, best-looking | ~200 | async API + grammar JSON per language; awkward against a synchronous render |

`highlight.js` it is. — DEC-1

---

## Requirements

### FR-1 — Languages

- **FR-1.1** A fence's language comes from react-markdown's `language-*` class on
  the `<code>` element.
- **FR-1.2** An alias table maps what people actually type onto highlight.js ids:
  `sh`/`shell`/`zsh`/`console` → `bash`, `ts`/`tsx` → `typescript`, `js`/`jsx` →
  `javascript`, `py` → `python`, `yml` → `yaml`, `rs` → `rust`, `golang` → `go`,
  and so on. An unknown token is **not** an error: the block renders plain.
- **FR-1.3** Grammars load **lazily, one `import()` per language**, from an
  EXPLICIT map (`lib/code-languages.ts`) — not a template-literal import. That is
  forced, not chosen: a template import makes webpack build a context module, which
  needs to resolve the *directory* `highlight.js/lib/languages`, and the package's
  `exports` field publishes only `./lib/languages/*` (the files). Vite resolves it,
  so it passed the test suite and failed `next build`.
- **FR-1.3.1** highlight.js's **core is lazy too**, loaded alongside the first
  grammar. A static core import cost 9 kB in the `/chat` bundle (86.1 → 95.4 kB
  measured) for every conversation including those with no code, on the main screen
  of a PWA. With both lazy, the cost is 1.7 kB (86.1 → 87.8 kB) and a codeless
  conversation loads no highlighter at all.
- **FR-1.3.2** The explicit map imposes a **coverage ceiling**: 70 grammars, not the
  384 highlight.js ships. Adding one is a single line. An unlisted language renders
  plain, which is what it did before this feature existed — a ceiling, not a
  regression. — DEFER-4
- **FR-1.4** The service worker already caches `/_next/static/*.js` cache-first, so
  a language chunk is fetched once and is then available offline.
- **FR-1.5** A block whose language has not loaded yet renders plain, then colours
  when it arrives. There is no spinner and no layout shift: the same text, the same
  metrics, only colour changes.

### FR-2 — The streaming path is not touched

- **FR-2.1** Code is **not highlighted while a reply is being revealed.** The
  reveal re-renders the assistant band up to `REVEAL_MAX_STEPS` (60) times, and
  `turn-store.ts` documents at length why that ceiling exists: each step re-parses
  the whole revealed markdown, so the cost is already O(n²) in the reply's length
  and was once slow enough that the reveal could not keep its own cadence.
- **FR-2.2** Measured, on a 200-line dense TypeScript block: **7.8 ms** per
  highlight. Sixty steps of that is ~470 ms of extra main-thread work per turn,
  per block. Not catastrophic, and not worth spending on text that is still
  arriving.
- **FR-2.3** `MessageContent` therefore takes a `streaming` prop, default `false`.
  Only the in-flight assistant band passes `true`. History, the canvas view and
  the markdown editor preview highlight immediately.
- **FR-2.4** When the reveal finishes, the same content renders with `streaming`
  false and the block colours. A completed block inside a still-streaming message
  stays plain until the message finishes — accepted: the alternative is knowing
  whether a fence is closed, which the markdown AST does not report (remark closes
  an unterminated fence at EOF).
- **FR-2.5** Highlight results are memoized by `(language, code)` in a bounded
  module-level cache, so the ordinary re-renders of a message list — hover, action
  menus, a sibling turn arriving — never re-highlight.

### FR-3 — Rendering and safety

- **FR-3.1** highlight.js returns an HTML string, injected with
  `dangerouslySetInnerHTML`. That is its intended use, and it is safe **because
  highlight.js escapes the code it is given**: `<script>` in a block comes back as
  `&lt;script&gt;`.
- **FR-3.2** That escaping is the security boundary of this feature, so it has a
  test of its own, asserting on the rendered markup — not on a promise in a
  docstring. Chat content is authored by an LLM and by other members; a block that
  could inject markup would be an XSS vector in every conversation.
- **FR-3.3** When a block is not highlighted (streaming, unknown language, not yet
  loaded), the code is rendered as **React children** — no `innerHTML` at all, so
  the un-highlighted path cannot inject anything either.
- **FR-3.4** Inline code (no `language-*` class) is never highlighted. It keeps
  today's tinted chip.

### FR-4 — Colours

- **FR-4.1** The palette is the one the admin editor already uses: the
  `--syntax-*` custom properties in `globals.css`, light and dark.
- **FR-4.2** highlight.js emits `hljs-*` classes. A CSS block maps that class set
  onto the existing roles, so there is **one** palette in the app rather than a
  vendored highlight.js theme drifting from it.
- **FR-4.3** `syntax-theme.ts` moves from `app/admin/` to `lib/`. It was written to
  be adopted without refactoring the admin screen, and this is the adoption; the
  move is the whole cost, and the admin imports change path and nothing else.

### NFR

- **NFR-1** One dependency, `highlight.js`. No wasm, no CSS from the package (the
  palette is ours), no build step.
- **NFR-2** Zero added cost on the reveal path (FR-2.1). A conversation with no
  code loads no highlighter at all.
- **NFR-3** The language table and the cache are pure and live outside React, so
  they are testable in this suite's `environment: "node"`.

## Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| DEC-1 | `highlight.js`, not CodeMirror / lezer / shiki | Read-only by design, synchronous, 384 grammars, per-language imports. The CodeMirror static path drags the editor core in |
| DEC-2 | Lazy per-language `import()` rather than a curated eager set | A curated eager set costs bundle on every chat load. Lazy still does not — though it does carry a coverage ceiling after all (FR-1.3.2), which the draft claimed it avoided |
| DEC-3 | No highlighting during the reveal | The reveal's re-render cost is already the thing `turn-store.ts` fought to bound |

## Deferred

| ID | Idea | Why not now |
| --- | --- | --- |
| DEFER-1 | Auto-detect an unlabelled fence's language | `highlightAuto` costs ~10 ms over three grammars and scales with how many are registered, it needs an eagerly-loaded subset (against DEC-2), and it mislabels short snippets confidently |
| DEFER-2 | Highlight a closed fence inside a message that is still streaming | Needs to know a fence is closed; the markdown AST does not say (FR-2.4) |
| DEFER-3 | A copy button per block | Unrelated to colour; belongs with the message action row |
| DEFER-4 | Generate the full 384-grammar map instead of maintaining 70 by hand | A codegen step for a list that changes when highlight.js releases; 70 covers what an agent writes, and the tail costs one line each |

---

## Traceability

| ID | Verified by |
| --- | --- |
| FR-1.1, FR-1.2 | Unit: `canonicalLanguage` over `language-ts`, `language-sh`, `language-unknown`, absent |
| FR-1.3 | Unit: `loadLanguage` registers once and is idempotent; unknown id resolves to unsupported without throwing |
| FR-1.5 | Component: a block with no grammar loaded renders its text plain |
| FR-2.3 | Component: `streaming` renders plain even when the grammar is available |
| FR-2.5 | Unit: the cache returns the same object for the same `(language, code)` and evicts past its cap |
| FR-3.1, FR-3.2 | Component: a block containing `<script>alert(1)</script>` renders escaped, and no `<script>` tag reaches the markup |
| FR-3.3 | Component: the un-highlighted path emits no `innerHTML` |
| FR-3.4 | Component: inline code keeps the chip and gains no `hljs-` class |
| FR-1.3.2 | Unit: every alias target is a grammar that exists (a dead alias renders plain and is otherwise invisible) |
| FR-4.2 | Unit: every `.hljs-*` block in `globals.css` declares a `--syntax-*` colour or is style-only |

---

## Reconciliation (what shipped)

**A template-literal `import()` does not work here, and the test suite could not
tell me.** `import(\`highlight.js/lib/languages/${id}\`)` makes webpack build a
context module over the directory, which the package's `exports` map does not
publish. Vite resolves it happily, so 30 test files passed and `next build` failed.
The fix is the explicit map in `lib/code-languages.ts`, and the cost is FR-1.3.2's
coverage ceiling — which DEC-2 had claimed lazy loading avoided.

**The core had to become lazy as well.** With `highlight.js/lib/core` statically
imported, every chat load carried it: `/chat` went 86.1 → 95.4 kB, on a screen that
frequently shows no code. Loading it with the first grammar brings that to 87.8 kB
and makes NFR-2's claim true rather than aspirational. `highlight()` stays
synchronous because it only runs for a language that is `ready`, and readiness
implies the core resolved.

**Two aliases pointed at a grammar that does not exist.** `tf`/`hcl` → `terraform`;
highlight.js has no terraform. A dead alias is invisible — the block renders plain,
exactly like an unknown language — so there is now a test asserting every alias
target is a real grammar.

**A cache test that could never fail.** The first version asserted
`expect(second).toBe(first)` to mean "the cache returned it". highlight.js returns a
string, and two equal strings are identical under `Object.is`, so it passed whether
the cache existed or not. The module now counts misses through a test seam and the
tests assert on that instead.

**Verification.** `yarn tsc --noEmit` clean; `yarn vitest run` **346 passed / 30
files**, including 20 for the highlighter module and 9 for the component; `yarn build`
succeeds. `/chat` 86.1 → 87.8 kB. A 200-line dense TypeScript block highlights in
7.8 ms, which is why FR-2.1 keeps it off the reveal path.
