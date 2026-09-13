# Config key master-detail

The Config tab picks its key through a native `<datalist>` on a text input. That is a
suggestion dropdown: it only opens once the admin types, it closes on every keystroke,
and it never shows the catalog as a whole. An admin who does not already know the key
they want cannot browse for it.

Replace it with a **master-detail**: every key the catalog carries, as a real list with a
filter over it; everything the panel already does — distribution, value, who else it
reaches, results — as the detail beside it.

This is a REPLACEMENT of one control, not a re-specification of the feature.
`admin-bulk-instance-config/spec.md` stays the authority on what the panel does with a
key once it has one; the decisions below are only about how the key is chosen and how
the rest of the panel is arranged around that choice.

Size: Medium. One component restructured, two pure helpers, copy in both locales.

## FR-1 — The key list

**FR-1.1** The catalog's keys render as a list of rows, all of them, visible without
typing. One row is one key.

**FR-1.2** A filter input sits above the list. It narrows the list by
case-insensitive substring over the key path. It does not submit anything.

**FR-1.3** Clicking a row selects that key. Selection is the panel's state; the filter
text is not.

**FR-1.4** A row says three things: the key path, whether the proxy owns it, and
nothing else. The harness the catalog came from is said ONCE, above the list, because
`TemplateConfigKeys(template, harness)` resolves one harness per catalog — every row
would carry the same word. This replaces the per-suggestion `(from the {h} config)`
label, and it serves the same requirement it was written for: an admin who has just
switched agents can tell which document is on screen.

**FR-1.5** When the filter matches nothing, the list says so with the text that matched
nothing — not with an empty box.

## FR-2 — A key the catalog does not carry stays reachable

The existing contract, quoted from `admin_bulk_config.go`:

> It is a suggestion list, not a whitelist: the inspect and apply verbs accept any
> syntactically valid dotted path, because a newer picoclaw's field or one added by an
> earlier repair is legitimately absent from the template.

A list, unlike a text input, closes that door by default. It must not.

**FR-2.1** When the filter text is non-empty and is not exactly a key the catalog
carries, the list offers it as its LAST row — "use this path" — and selecting it selects
that path.

**FR-2.2** That row is visibly not a catalog row, and says why it is being offered.

**FR-2.3** `agents.defaults.max_tool_iterations` is the live case: the ganglion catalog
is derived from the generated document, which does not emit it, and it is nonetheless a
key the harness reads and an admin sets. Typing it must reach it.

## FR-3 — Selecting reads

**FR-3.1** Selecting a key inspects it immediately. No second click. (The owner chose
this over an explicit button: "clique diretamente nela".)

**FR-3.2** An inspection already read for this (scope, agent, key) is reused rather than
re-fetched, so moving back to a key costs nothing. `inspectionKey` is already that
identity.

**FR-3.3** An apply SPENDS its inspection — that rule is unchanged and now has to reach
the cache too. After an apply the cached entry for that key is dropped, so the panel
shows "Read again" rather than restoring the view the write invalidated.

**FR-3.4** Selecting a different key clears the value field, the submit error and the
last apply's results. A value typed for one key must never be sitting in the form under
another.

**FR-3.5** A managed key is NOT inspected on selection. Its detail is the reason it
cannot be changed here.

**FR-3.6** Moving the selection while a read is in flight leaves nothing reading. The
abandoned read is cancelled and skips its own cleanup — its answer must not land on a
key that is no longer selected — so the selection that replaced it is what has to clear
the flag. Landing on a CACHED key is the case that strands the panel outright: no
request is issued, and the re-read button that would recover it is disabled by the very
flag that is stuck.

## FR-4 — The managed row

**FR-4.1** Managed keys stay listed. They are listed precisely so an admin looking for
one finds it rather than hunting.

**FR-4.2** A managed row is selectable, not inert. A row that swallows the click says
nothing; `isManagedKey` exists so the screen can say why instead.

**FR-4.3** Selecting one shows the key and `managedPicked` in the detail, and no value
form. This is the same refusal the field's `consequence` carried, moved to where the
work now happens.

## FR-5 — Where the two catalog disclosures go

Splitting a two-panel layout puts these on opposite sides, and getting it wrong makes
DEC-4's disclosure-not-authority principle read as arbitrary placement.

**FR-5.1** `generatedDoc` — "this agent has no configuration template" — belongs with
the LIST. It is about the document the list was derived from.

**FR-5.2** `futureTemplateAbsent` — "there is no agent template to write here" — belongs
with the fieldset in the DETAIL. It is about the write.

## FR-6 — Mobile

**FR-6.1** Below `lg` there is one column. The list is what shows until a key is
selected; then the detail replaces it.

**FR-6.2** The detail carries a control back to the list. Without it a phone has no way
to change keys — the same hole the shell redesign's back-control filled.

**FR-6.3** At `lg` and above both are visible at once and no back control is drawn.

**FR-6.4** Rows are 44px touch targets, at every width, per `column-view.tsx`'s rule
that a list whose row height changes between a phone and a desktop reads as two lists.

## What does not change

- The proxy. No new endpoint, no changed response.
- Every decision in `admin-bulk-instance-config/spec.md` about inspect-before-write,
  revisions, the future-target choice, `bulkPolicy`, and the result grouping.
- `bulk-config-state.ts`'s existing helpers.

## Out of scope

- `InstanceConfigEditor`, which lives in the Members tab and picks no key.
- The harness publishing its readable-key set, which is what would put
  `agents.defaults.max_tool_iterations` in the catalog for real. Recorded as the next
  slice in `crab-shell-proxy/.specs/features/harness-aware-config-catalog/spec.md`;
  FR-2 is what makes the key usable until then.
