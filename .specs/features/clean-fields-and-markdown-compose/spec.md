# Cleaner fields, and a markdown body that renders as it is typed

## The request

> Go over every text input so they are cleaner, with fewer borders. In the new mangrove
> publication, allow inline rendering of markdown.

## FR-1 — One field style, drawn by tone

- **FR-1.1** `field` (an `@utility` in `app/globals.css`) is the app's one form-field
  style: a translucent fill mixed from `--fg` (`--field`, so it reads on any panel tone),
  a step stronger under the pointer (`--field-hover`), a
  `--focus-soft` ring only while focused, and a transparent 1px border kept for layout
  and for forced-colors mode. No visible border at rest.
- **FR-1.2** Every input, select, textarea and field wrapper in `app/` and `components/`
  uses it: the `Input` primitive's default variant, `admin/field.tsx`'s control, and the
  hand-written class strings in the admin panels, the mangrove forms, the memory and
  skills editors, own models, projects and the colour picker.
- **FR-1.3** The chat composer's box drops its border too: fill and shadow set it apart,
  and focus draws a hairline ring instead of growing a 2.5px border (which moved the
  text inside it on every focus).
- **FR-1.4** `Textarea` no longer sets `bg-transparent`. Tailwind's preflight already
  clears form-control backgrounds, and the class beat `field` in the generated CSS.
- Out of scope: the sign-in screen, which has its own landing design system (`--l-*`).

## FR-2 — The mangrove body renders markdown inline

- **FR-2.1** With the format set to markdown, the publication body is a WYSIWYG
  markdown field (`app/chat/markdown-field.tsx`): headings, emphasis, lists, quotes,
  code and GFM tables render as they are typed, and the value is markdown.
- **FR-2.2** Built on `@milkdown/kit` 7.22.2 (commonmark, gfm, listener, history,
  clipboard), which parses and serialises through remark -- the ecosystem the published
  post is rendered with. `@milkdown/react` is not used: it depends on the full `crepe`
  editor.
- **FR-2.3** Loaded with `next/dynamic` and `ssr: false`: ProseMirror needs a DOM, and
  only the compose form pays for it.
- **FR-2.4** Plain text keeps the plain textarea: the markdown serialiser would escape
  `*`, `_` and `#` in it. Switching format carries the same string across.
- **FR-2.5** Its typography matches `MessageContent`, from tokens only (`.markdown-field`
  in globals.css). The label is on the editable surface (`role="textbox"`).
- **FR-2.6** Suites that render the compose form replace the editor with a textarea
  through `markdown-field.test-double.tsx`; `markdown-field.test.tsx` tests the real one.
