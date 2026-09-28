# The tab strip: a floor under the width, and which project a tab is in

## The request

> A tab whose conversation is named with a three-letter word gets so narrow that trying to
> click it closes it instead. Give it a minimum width with room for at least ten characters.
> And I asked in an earlier conversation for the tab to show the project the chat belongs to,
> in small type — it is not there. Implement it.

## FR-1 — Ten characters of room, whatever the title

The tab was `min-w-0 max-w-52`: no floor at all, so its width was its content's. A
three-letter title drew a tab barely wider than its own `×`, and the two targets sat against
each other — aiming at the tab hit the close button.

The floor goes on the TITLE, not on the tab: `min-w-[10ch]`, which is the request read
literally and does not depend on the padding arithmetic around it. `ch` is the width of a
`0` in the tab's own font and size, so the promise holds if either changes.

The `max-w-52` ceiling stays, and the title still truncates within it.

## FR-2 — The project, in small type

This is the case the tab's identity exists for. `tabKey` is the whole tuple —
`t | s | r | p | sid` — precisely because the same conversation can be open in two projects
(see conversation-tabs.ts), and until now the strip drew both identically.

The name sits UNDER the title at `text-[10px]`, muted: it qualifies the name rather than
being one. It is in the tab's `title` attribute too, as `Title — Project`, so a truncated
one can still be read in full.

**Under, not beside.** Side by side the two competed for one line — flex took from both and
a tab read `Uma conversa de nome … Juri…`, where the qualifier is the part short enough to
survive whole and the one that is useless in pieces. Capping the project instead just moved
the cost onto the title. On its own line neither has to give, and the title gets the tab's
whole width back.

The tab's contents are centred vertically, so a tab with no project keeps its title on the
same line as the tabs that have one: the strip has one height, not one per tab.

## DEC-1 — Resolved at render, not stored on the tab

`projectName` is a lookup the shell passes, not a field on `Tab`. Tabs are persisted to
`localStorage`, so a name stored beside the id would still read the old one after the
project was renamed. `title` already has that flaw; there was no reason to add a second.

The shell resolves it from the `projects` list it already holds for the breadcrumb.

## DEC-2 — A tab in another workspace's project is not named

The shell holds only the CURRENT workspace's projects, and a tab can point into another
workspace entirely — that is what the tuple is for. The lookup answers null there and
nothing is drawn: a gap, not a wrong label.

Naming it would mean fetching the project lists of every workspace the strip happens to
touch, which is a request per workspace on every render of a strip that is meant to be
chrome.
