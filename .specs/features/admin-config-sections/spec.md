# The config tab: a panel that fits, and a list that groups

Four complaints about one screen, all of them about the same panel —
`BulkConfigPanel`, the only thing the `config` tab renders.

## FR-1 — The panel fits the window

**FR-1.1** From `lg`, the detail column takes `max-h-[72dvh]`. Everything that grows —
the distribution, the value field, the outcome list — shares one scroller inside it.

**FR-1.2** The Apply button, the submit error and the restart sentence sit in a bar
below that scroller which does not move.

The column used to grow with whatever it held: a distribution over forty members, each
bucket printing a whole configuration value. It pushed the value field, the restart
sentence and the Apply button off the bottom of the window, and an admin then scrolled
the **page** to reach a control they had been looking at a moment earlier.

**FR-1.3** Below `lg` there is no ceiling and no inner scroller. A phone has one column,
the page scroll is the only scroll it has, and nesting a second one there is how a pane
stops being reachable at all. `instance-config-editor.tsx` is the exemplar for the
bounded shape; it is a modal on the members tab and was already disciplined this way.

**FR-1.4** The restart sentence lives in the pinned bar rather than beside the fields it
qualifies. It is the one place the screen does not obey the shared restart control
(`bulkPolicy` downgrades `now` to `notice`), and a disclosure an admin has to scroll to
find is a disclosure the screen is not really making.

## FR-2 — A long value is cut, with a count

**FR-2.1** A distribution bucket's value is clamped to `VALUE_CLAMP_LINES` (8) lines and
expands on click.

**FR-2.2** **By lines, not by characters.** What overflows is height: a character budget
would cut a 6-line object and a 60-line one at wildly different places for the same
visual cost.

**FR-2.3** The toggle appears only when something is hidden, and its collapsed label
carries the **count** — "Show 12 more lines" tells an admin whether expanding is worth
the scroll; "Show more" does not.

## FR-3 — The key list is two groups, not one list with a repeated subtitle

**FR-3.1** `keySections` splits the rows into **"Yours to set"** and **"Injected by the
proxy"**, one heading and one sentence each.

**FR-3.2** Editable first. The managed group is listed at all so an admin hunting a key
finds it and learns why it is not theirs to set; the editable group is the one anything
can be done with.

**FR-3.3** The free row — the typed path — files with the editable keys and stays last
among them.

**FR-3.4** An empty group is dropped rather than drawn as a heading over blank space.

The per-row `managedSuffix` is gone from this list. In a ganglion catalog most rows are
the proxy's, so it was a dozen copies of one sentence down a narrow column, each
competing with the dotted path that is the row's actual content. Two things survive at
row level because a heading cannot carry them: the free row's "not in the document the
proxy read", and `tunableSuffix` — "not in the document yet".

## FR-4 — A proxy-owned key has a read-only preview

**FR-4.1** Selecting a managed key reads it. The distribution renders; no value field,
no future-target fieldset, no submit button.

**FR-4.2** The panel trusts the **proxy's** `managed` flag over the catalog's once an
inspection lands (`managedNow`). The catalog's answer shapes the screen until then and
is right about every row the picker offered; only the proxy can be right about a path
typed by hand, which is exactly where being wrong means offering a write that can only
400.

**FR-4.3** "Read again" is offered for a managed key too. It used to be hidden there
because a managed key produced nothing but a refusal; it produces the preview instead,
and a preview an admin cannot refresh is a preview they have to reload the page to
trust.

**FR-4.4** The copy says credentials are not served: an api key or a bearer token reads
as `***`. The masking is the proxy's — `ReadInstanceConfig` strips
`model_list[*].api_keys` and every `tools.mcp.servers.*.headers` value before the
inspection buckets anything — and the client neither performs nor relies on any masking
of its own.

## FR-5 — A tuning key says what an empty distribution means

**FR-5.1** A row the catalog marks `tunable` is the admin's to set, appears in the
editable group, and carries `tunableSuffix` on the row.

**FR-5.2** Selecting one shows a sentence saying two things nothing else on the screen
does: an empty distribution means the **harness's own default** is in force rather than
that something is missing, and a value set here is stored beside the configuration file
and takes effect **the next time the member's agent starts**, not on the turn they are
in.

The second half matters because it is the opposite of what the same screen does for a
model change. The ganglion re-reads its configuration file on mtime, so a model change
reaches a running container; the iteration cap and the sub-agent budget are read once,
at boot, into the loop and the tool set.

## Not covered

`pane-weight.test.ts` still covers only `app/chat`. It says `/admin` is deferred to its
own pass, and this change does not make that pass.
