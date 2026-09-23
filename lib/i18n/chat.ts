import type { Locale } from "./config";

// Copy for the whole /chat experience, sub-keyed by component -- the same
// shape landing.ts uses (t.hero.title, t.memory.body).
//
// Proper nouns are not translated: Canvas and Tree are the product's names for
// the two views, and agent/workspace identifiers come from the API.

const en = {
  shell: {
    // The phone's one control over the sidebar. It says "menu", not "workspaces": the
    // drawer holds the destinations and the conversation list now, and choosing an agent
    // happens on a screen of its own.
    openMenu: "Open menu",
    closeMenu: "Close menu",
    // The sidebar's list of places. A <nav> needs a name to be told apart from the
    // conversation list below it, which is also a nav.
    destinations: "Go to",
    // The two kinds of destination, named over their rows. A screen REPLACES the
    // conversation; a tool OPENS BESIDE it. The distinction was structural and
    // invisible -- six rows that looked alike and behaved as two things -- and these
    // are what say it out loud.
    //
    // Plain nouns rather than a sentence each: they head two and five rows that are
    // already labelled, so the heading's whole job is to say which of the two a row
    // belongs to.
    groups: {
      screens: "Screens",
      tools: "Tools",
    },
    // The rail entry that reveals the conversation list, and the ONLY one whose hover
    // opens the collapsed sidebar's preview. Named here rather than reused from
    // `landing.conversations`, which is a heading over a list on another screen.
    conversations: "Conversations",
    // The breadcrumb across the top. A second nav needs a second name: "Go to" is the
    // list of where you could go, this one is where you already are.
    path: "Path",
    // The breadcrumb's trailing chevron. It names the conversation's actions rather than
    // the chevron, because what the menu holds is what a member is looking for.
    crumbActions: "Conversation actions",
  },
  landing: {
    // The centre pane with no conversation open, at an agent's root and inside a
    // project alike. It is the screen that replaced an empty transcript, so the heading
    // says what to DO rather than naming a place -- "Agent" and the project's name are
    // already in the path above it.
    title: "Start a conversation",
    // Over the list below the composer. Short, because the path already says which
    // agent and which project these belong to.
    conversations: "Conversations",
    // The conversations here are the scope's, and the scope is the project you are in.
    // Said once, under the heading, rather than repeated on every row.
    inProject: "In {name}",
  },
  pane: {
    // Prefixes, completed with the pane's own name: "Expand Conversations".
    expand: "Expand",
    resize: "Resize",
    // The workspace pane's X. Completed the same way — "Close Files" — because two panes
    // can be on screen at once and "Close" alone would not say which.
    close: "Close",
  },
  nav: {
    collapseSidebar: "Collapse the sidebar",
    collapse: "Collapse",
  },
  emptyState: {
    title: "Pick a workspace to start",
    body: "Choose a tenant, account, and agent on the left. Its conversations open in a second panel, ready for you to type.",
  },
  workspaceGrid: {
    title: "Pick a workspace",
    body: "Everything you can reach, grouped by tenant and subscription. Click an agent to open a fresh conversation with it.",
    // Only read-only access is marked: write is the norm, and a pencil beside a name read as
    // a control rather than a statement about permission.
    readOnly: "read-only access",
  },
  connectivity: {
    title: "Can't reach the gateway",
    body: "We couldn't check your account right now. Is the stack running?",
  },
  adminLink: {
    label: "Administration",
  },
  logout: {
    action: "Log out",
    confirmTitle: "Log out?",
    confirmMessage: "You'll need to sign in again with a magic link.",
    pending: "Logging out…",
  },
  // The chats sidebar's three parts. Shared rather than per-panel: the whole point
  // of the section headers is that they are the same control in three places.
  workspaceNav: {
    filterPlaceholder: "Filter workspaces",
    // Every empty state in both sidebars is a TITLE plus a next step, rendered by
    // components/ui/panel-empty.tsx. So the title says what happened and stays short;
    // the hint says what to do about it. `none` used to carry both in one sentence.
    noMatch: "No workspaces match your filter.",
    noMatchHint: "Clear the filter to see everything you can reach.",
    none: "You aren't in any workspaces yet.",
    noneHint: "Ask an operator to add you to one.",
  },
  composer: {
    replyingToBefore: "Replying to ",
    replyingToUser: "you",
    replyingToAgent: "the agent",
    replyNoText: "(no text)",
    cancelReply: "Cancel reply",
    removeAttachment: "Remove",
    slashCommands: "Slash commands",
    mentionFiles: "Workspace files",
    placeholder: "Message your agent…",
    placeholderHint: "Message your agent…  (Shift+Enter for a new line)",
    attach: "Attach file",
    uploading: "Uploading…",
    anyFile: "Any file",
    // The overlay shown while files from outside the browser are held over the
    // conversation.
    dropToAttach: "Drop to attach to this message",
    advancedEditor: "Advanced markdown editor",
    send: "Send message",
    // Honest, not decorative: the turn is really aborted upstream and rolled out
    // of the transcript, and what was typed comes back into the box.
    stop: "Stop generating",
    stopping: "Stopping…",
  },
  attachment: {
    download: "Download file",
    downloading: "Downloading…",
  },
  preview: {
    aria: "File preview",
    action: "Preview",
    // Two kinds have two readings -- markdown is a document and the marks that make
    // it, html is a page and the markup that makes it -- and each used to offer only
    // one, in opposite directions.
    viewLabel: "How to read this file",
    viewRendered: "Rendered",
    viewSource: "Source",
    wrapLines: "Wrap long lines",
    // The label on the panel that separates a markdown file's leading `---` block
    // from the document. Useful above all when reviewing a SKILL.md, where the
    // block decides whether the skill loads at all.
    frontmatter: "Frontmatter",
    // The PDF pane draws its own pages rather than handing the file to the browser's
    // viewer — see `pdf-pane.tsx`. These are the two controls that came back with it.
    pdfPrev: "Previous page",
    pdfNext: "Next page",
    pdfZoomIn: "Zoom in",
    pdfZoomOut: "Zoom out",
    pdfZoomReset: "Fit to width",
    tooLarge: "This file is too large to preview. Download it to open it.",
    pdfFallback:
      "This browser cannot display the PDF here — download it instead.",
    // Said rather than silently shown: a preview that cut a sheet off without saying so
    // would misrepresent the file.
    sheetTruncated:
      "Showing the first {n} rows. Download the file for all of them.",
    // A presentation is a visual medium and this shows its text. Said out loud for the
    // same reason the row cap is: a partial view that does not admit it misrepresents
    // the file (preview-formatting-and-odf FR-3.3).
    slidesPartial:
      "Text extracted from the slides. Download the file to see the deck itself.",
    // Scripts in an HTML preview. Off by default and never persisted past the browser
    // session; the dialog is what the member agrees to, so it says the four things that
    // are true rather than a generic "are you sure".
    scriptsOff: "Scripts are off. This page may not display as intended.",
    scriptsEnable: "Run scripts",
    scriptsOn: "Scripts are running in this preview, for this session.",
    scriptsDisable: "Turn off",
    scriptsTitle: "Run scripts in previews?",
    scriptsRisk:
      "This page was written by the agent from material it did not control. With scripts on it can send what the document contains to any address on the internet, and reach hosts your browser can see and our servers cannot.",
    // The half that is safe, said as plainly as the half that is not: a warning nobody
    // believes is a warning nobody reads.
    scriptsSafe:
      "Your session, your cookies and the rest of this app stay out of its reach — the preview has no access to them.",
    // DEC-1's cost, said out loud rather than left implicit.
    scriptsScope:
      "This applies to every HTML file you open until you close the browser, including ones the agent downloads later.",
    slide: "Slide {n}",
    // An unrecognised extension is opened on trust now, so the file that turns out to be
    // binary says so once its bytes have arrived. A notice, not an error.
    binary: "This file isn't text. Download it to open it.",
  },
  markdownEditor: {
    aria: "Markdown editor",
    heading: "Markdown editor",
    previewEmpty: "Preview appears here.",
    saveDraft: "Save draft",
    hidePreview: "Hide preview",
    showPreview: "Show preview",
    closeTitle: "Close (Esc)",
    placeholder: "Write in markdown…  (Ctrl/⌘+Enter to send, Esc to close)",
    tools: {
      heading: "Heading",
      bold: "Bold",
      italic: "Italic",
      inlineCode: "Inline code",
      codeBlock: "Code block",
      bulletedList: "Bulleted list",
      numberedList: "Numbered list",
      quote: "Quote",
      link: "Link",
      table: "Table",
    },
  },
  memory: {
    title: "Workspace memory",
    hint: "Saved to MEMORY_CUSTOM.md — the agent reads it on every message.",
    // The old collapsible editor hardcoded "Save"/"Saved" in English, which the
    // parity test could not see because they never reached a locale dict.
    saved: "Saved",
    placeholder: "e.g. Always answer in Portuguese. Our stack is Next.js + Go…",
  },
  scheduledTasks: {
    title: "Scheduled tasks",
    hint: "What the agent runs on a schedule, and what each run produced. Read-only: ask the agent to create or change a task.",
    // The store carries no per-run outcome, so the list never claims one. This
    // sentence is why there are no success ticks next to the executions.
    noOutcomeHint:
      "Only the most recent run of a live task records a status — earlier runs show how long they took and how much they logged.",
    schedule: {
      cron: "Cron {expr}",
      every: "Every {interval}",
      at: "Once at {instant}",
      // An unfamiliar schedule kind from a newer picoclaw: named, not guessed at.
      unknown: "Schedule: {kind}",
    },
    disabled: "Disabled",
    // Shown when the proxy reports fires:false -- the instance stops when idle,
    // so its timers do not exist most of the time.
    inert: "These tasks are not running",
    inertHint:
      "This instance shuts down when idle, and a schedule only fires while it is up. The tasks below are still recorded — an administrator has to switch this instance to continuous for them to run.",
    nextRun: "Next run",
    lastRun: "Last run",
    neverRan: "Has not run yet",
    lastStatus: "Status",
    lastErrorLabel: "Error",
    deliversTo: "Delivers to {target}",
    oneShot: "Removes itself after running",
    runs: "{count} run(s)",
    noRuns: "No runs recorded.",
    entries: "{count} entries",
    // A run whose task is gone from the store — the normal end state of a
    // one-shot task, so it is labelled rather than hidden.
    removedTask: "Removed task",
    removedTaskHint:
      "The task is no longer scheduled, but this run is still on record.",
    transcriptMissing: "The transcript for this run is no longer available.",
    backToTasks: "Back to tasks",
    toolCall: "{name}",
    toolResult: "Tool result",
    expandTool: "Show details",
    collapseTool: "Hide details",
    reference: "Reference in chat",
    referenceAria: "Reference this in the chat",
    // What the composer banner calls the two things that can be referenced.
    referencedTask: "Scheduled task",
    referencedRun: "Task run",
    cancelReference: "Remove reference",
    // The marker words that travel INSIDE the sent message, so the agent reads a
    // reference in the member's own language — same idea as the `[anexo: …]` refs.
    markerTask: "scheduled task",
    markerRun: "task run",
    markerLastRun: "last run",
    none: "No scheduled tasks yet.",
    noneHint: "Ask the agent to schedule something and it will appear here.",
    refresh: "Check for new tasks",
    refreshAria: "Refresh scheduled tasks",
    hideFinished: "Hide finished",
    hideFinishedTitle: "Hide tasks that already ran and will not run again",
    finishedHidden: "{count} hidden",
    allFinished: "Everything here has finished.",
    allFinishedHint:
      "Turn off “Hide finished” to see past tasks and their results.",
    showMoreRuns: "Show {count} older run(s)",
    // A task's heading can be a whole prompt. The toggle appears only when
    // something is actually hidden.
    showMore: "show more",
    showLess: "show less",
    showFewerRuns: "Show fewer runs",
  },
  memoryGraph: {
    // Deliberately NOT "memory": the panel already has one, and t.memory.* is
    // MEMORY_CUSTOM.md. Two different memories need two different visible names.
    title: "Knowledge graph",
    open: "Open the knowledge graph",
    // The agent writes to the graph mid-conversation, so the pane goes stale while
    // it is being read. Same control, same words as the files tree and the task list.
    refresh: "Refresh",
    refreshAria: "Refresh the knowledge graph",
    hint: "What the agent has learned on its own — entities, how they relate, and the observations behind each one. Read-only: the agent writes this, you inspect it.",
    tabs: {
      browse: "Entities",
      // The node-link view. "Map" rather than "Graph": the panel is already called the
      // knowledge graph, so a tab with that name would say nothing about what differs.
      map: "Map",
      search: "Search",
      recent: "Recent",
    },
    // The panel is a narrow column by default and a graph needs room; without this the
    // whole map fits at about a quarter scale and no zoom recovers the labels.
    expandMap: "Expand the map to full screen",
    collapseMap: "Leave full screen",
    spreadOut: "Spread the nodes further apart",
    spreadIn: "Pull the nodes closer together",
    fitMap: "Fit the whole graph in view",
    spreadReadout: "spread {value}x",
    // A substring over entity names, not the Search tab's BM25 ranking — the placeholder
    // says "filter" rather than "search" so it does not promise the other behaviour.
    mapFilterPlaceholder: "Filter entities by name",
    // The map caps how many nodes it draws, because the layout cost grows with the square of
    // the node count and would freeze the tab. Filter to reach the rest.
    mapTruncated: "{count} more not shown — filter to narrow",
    searchPlaceholder: "Search the graph…",
    searchHint:
      "Ranked by BM25 term relevance, so you do not need the exact stored wording. It does not understand synonyms.",
    // The Search tab before a query has been typed. It used to render NOTHING at all —
    // a blank pane that read as a broken tab rather than as a tab waiting for input.
    searchIdle: {
      title: "Search the graph",
      body: "Type a term and press Enter to look through every entity and observation the agent has stored.",
    },
    observations: "observations",
    relations: "relations",
    noResults: "Nothing matched that search.",
    noResultsHint:
      "Ranking is by term relevance, not by meaning — try the wording the agent would have stored.",
    // The MAP's own empty result. Deliberately not `noResults`: that tab runs a BM25
    // search over everything, this one is a substring filter over names, and telling a
    // member their search failed when their filter did sends them to the wrong fix.
    mapNoMatch: "No entity matches that filter.",
    mapNoMatchHint:
      "The map filter matches names only. Clear it to see the whole graph.",
    noObservations: "No observations recorded yet.",
    confidence: "confidence",
    archived: "Archived — hidden from the agent's own browsing.",
    allTypes: "All",
    noneOfType: "Nothing of that type.",
    // Names the "All" chip, because that chip is the way back and it is directly above.
    noneOfTypeHint: "Choose All above to see every entity again.",
    closeDetail: "Close details",
    resizeDetail: "Resize the details panel",
    sources: "Where this came from",
    sourcesHint: "Click a conversation to open it.",
    noSources:
      "No conversation recorded. The agent writes without a source when a scheduled job saved it, or when two chats were open at once.",
    goneConversation: "Conversation no longer available",
    mergedInto: "Merged into",
    // Referencing an entity in the chat. The marker carries the NAME, not the facts: the agent
    // reads its own graph, so a copy of the observations would only bloat the transcript.
    referenceEntity: "Reference this entity in the chat",
    referencedEntity: "Referenced entity",
    markerEntity: "graph entity",
    // Ticking several entities at once, which is a different act from opening one: the
    // row click still opens the detail pane, the tick beside it only adds to this set.
    selection: {
      // `{name}` is the entity, and it is what makes forty identical ticks tell a screen
      // reader which row it is on.
      selectEntity: "Select {name}",
      one: "1 entity selected",
      many: "{count} entities selected",
      // A checked entity the current filter, search or tab is not showing. It stays
      // checked — the member chose it — so the count is what keeps it from being a
      // surprise later.
      hidden: "{count} not in view",
      // Into the mangrove. Absent where this deployment has no mangrove, so the string
      // is only ever read where the feature exists.
      share: "Share in the mangrove",
      clear: "Clear selection",
    },
    empty: {
      title: "Nothing learned yet",
      body: "The agent builds this as you talk to it. Ask it to remember something and it will show up here.",
    },
    recentCopy: {
      learned: "Learned in the last 24h",
      newEntities: "New entities",
      newRelations: "New relations",
      nothing: "Nothing new in the last 24 hours.",
      nothingHint:
        "The agent adds to the graph as you talk to it — the Entities tab shows everything it already knows.",
    },
    // The map's discovery tools. Grouped under one key rather than scattered across
    // memoryGraph.* because they belong to one surface — the disclosure panel over the stage —
    // and a flat list of thirty more siblings would bury the ones that were already here.
    mapTools: {
      open: "Discovery tools",
      close: "Hide the tools",
      filters: "Filters",
      relationTypes: "Relation types",
      relationTypesAll: "All relations",
      relationTypesNone:
        "No relation types selected — the entities are drawn without their connections.",
      noRelationTypes: "The agent has not recorded any relations yet.",
      minObservations: "At least {count} observations",
      minObservationsAny: "Any number of observations",
      focus: "Focus",
      // The radius is spelled out rather than shown as a bare number, because "2" next to a
      // node count reads as a quantity of things rather than a distance.
      focusHops: "{count} hop",
      focusHopsPlural: "{count} hops",
      focusHint: "How far from the selected entity stays lit.",
      legend: "Legend",
      // A rendered count of zero is legitimate and expected: the legend lists every type in
      // the graph so it cannot empty itself when you filter, so a filtered-out type shows 0.
      legendHiddenByFilter: "hidden by the current filter",
      legendClear: "Show every type again",
      hoverType: "type",
      encoding: "Encoding",
      sizeBy: "Size shows",
      colorBy: "Colour shows",
      sizeObservations: "Observations",
      sizeDegree: "Connections",
      // Named for what it answers, not for the algorithm. "PageRank" is a proper noun that
      // tells a member nothing about what the bigger circles mean.
      sizePagerank: "Influence",
      sizeBetweenness: "Bridging",
      sizePagerankHint:
        "How much of the graph flows through an entity, counting its neighbours' importance too.",
      sizeBetweennessHint:
        "How often an entity sits on the only route between two others. Computed on demand — it is the slow one.",
      colorType: "Entity type",
      colorCommunity: "Cluster",
      colorComponent: "Connected group",
      colorCommunityHint:
        "Groups the agent never labelled, inferred from how densely entities relate.",
      colorComponentHint:
        "Entities reachable from each other. Separate colours never connect at all.",
      insights: "Insights",
      insightsTop: "Strongest by {metric}",
      // The whole point of GD-B4: scores are whole-graph, the map is capped and filtered, so a
      // row can name something that is not drawn. Saying so beats a click that appears dead.
      insightsOffMap: "not on the map",
      insightsIsolated: "{count} isolated — known but never connected",
      insightsIsolatedOne: "1 isolated — known but never connected",
      insightsIsolatedNone:
        "Everything the agent knows connects to something else.",
      insightsScope: "Measured across the whole graph, not just what is drawn.",
      path: "Path",
      pathEnable: "Trace a path",
      pathDisable: "Stop tracing",
      pathPickFirst: "Pick the first entity on the map.",
      pathPickSecond: "Now pick the second.",
      pathFrom: "From",
      pathClear: "Start over",
      // Undirected on purpose — the agent writes relations with no direction convention, so a
      // directed search would answer "no path" for most real questions. Said out loud because a
      // member looking at arrowheads will reasonably assume otherwise.
      pathUndirectedHint:
        "Follows relations in either direction, whichever way the arrows point.",
      pathUnreachable: "Nothing on the map connects these two.",
      pathUnreachableHint:
        "They may still be related through an entity the filter or the node limit left out.",
      // A different fact from 'unreachable', with a different fix.
      pathMissing: "{names} is not on the map right now.",
      pathMissingHint:
        "Clear the filter, or raise what the map is showing, then trace again.",
      pathSame: "That is the same entity twice.",
      scopeNames: "Names",
      scopeContents: "Contents",
      scopeLabel: "Filter matches",
      scopeNamesHint: "Instant, and only matches the entity's name.",
      // The reason this scope exists: the map could not find an entity by anything only its
      // observations said.
      scopeContentsHint:
        "Asks the server, and also reads what the agent observed about each entity.",
      scopeSearching: "Searching…",
      scopeFailed: "That search could not be completed.",
      scopeCapped: "Showing the {count} best matches — there may be more.",
      reset: "Reset everything",
      // Names what it clears, because it reaches past this panel: the entity-type filter is shared
      // with the Entities tab, so a member who does not know that would find that list changed too.
      resetHint:
        "Clears the filters, the encodings, the focus radius and the entity-type filter shared with the Entities tab.",
      resetNothing: "Nothing to reset — everything is at its default.",
    },
    // The no-match state has to say the right thing about WHICH filter matched nothing: the
    // names-only wording sent members looking for a spelling mistake when they had actually
    // searched observation text.
    mapNoMatchContents: "Nothing the agent observed matches that.",
    mapNoMatchContentsHint:
      "This searched names, types and observation text. Try the wording the agent would have stored.",
  },
  view: {
    // Attribution inside the blockquote a reply inserts into the message.
    quoteUser: "You",
    quoteAgent: "Agent",
    replyAria: "Reply to this message",
    reply: "Reply",
    agentPrefix: "agent",
    // "…retrying… (attempt 2 of 3)"
    retrying: "Couldn't reach the gateway — retrying… (attempt {n} of {total})",
    settling: "We're storing your file…",
    resumeHeading: "Continue where you left off",
    // Was hardcoded English in the JSX, so it stayed English in pt and the parity
    // test could not see it -- that check only compares strings that reach a dict.
    resumeBody:
      "Jump back into your most recent conversation with agent {agent}.",
    // Inside a project the card offers a conversation from THAT project, so naming
    // the parent agent would describe the wrong scope. The project's own name is
    // deliberately absent: it is already the sidebar's header and the collapsed
    // rail's initials, and interpolating it here would need the projects list to
    // have loaded -- which means a frame of the wrong copy while it has not.
    resumeBodyProject:
      "Jump back into your most recent conversation in this project.",
    startHeading: "Start a new chat",
    startBody: "Ask agent {agent} anything to get going.",
    // Same scope correction as resumeBodyProject: a chat started here is answered
    // by the project, not by the agent's own workspace.
    startBodyProject: "Ask anything in this project to get going.",
    agentPulse: "Agent pulse",
    // Shown in the assistant band before the first word of the reply arrives.
    // `working` is the honest fallback when the agent has gone quiet: it claims
    // only that the turn is still open, which the client knows to be true.
    thinking: "Thinking…",
    working: "Still working…",
    // long-turn-resilience: the stream was cut and the turn is being recovered from
    // the transcript. Said plainly rather than disguised as ordinary progress: the
    // member is now waiting on a different thing, and the honest line is also the
    // reassuring one.
    recovering:
      "Connection dropped — the agent is still working. Fetching the reply…",
    // turn-stream-continuity FR-22: the member's OWN device has no connection.
    // Distinct from `recovering`, which says we lost the stream but can still reach
    // the gateway — different problem, different action. Reading them as the same
    // thing is what makes a tunnel feel like a broken app.
    offline:
      "You're offline — the agent is still working. Reconnecting when your connection returns…",
    // steering-messages: this message was folded into a turn that was already
    // running, so it gets no reply of its own and what streams below belongs to that
    // turn. Said plainly because the alternative reading — "the chat is slow to
    // send" — is the one the member arrives at on their own, and it is wrong.
    steering:
      "Added to the turn already in progress — the agent will take it into account. The reply below belongs to that turn.",
    // "Using web_fetch" -- the fallback when the agent didn't narrate the call.
    // The ganglion's answer to the same condition: it serializes turns per
    // conversation, so this message is its OWN turn waiting rather than one folded
    // into somebody else's. What arrives here is the reply to this message.
    queuedBehind:
      "This conversation already had a turn running, so yours is waiting for it. The answer below is to this message.",
    usingTool: "Using {tool}",
    // A message that has left the composer and is waiting for its turn.
    queued: "Waiting to send",
    // Header of a collapsed run of narration steps in the transcript. It states
    // the count so the closed block already says whether it is worth opening.
    stepOne: "1 step",
    stepsOther: "{n} steps",
    // The model's own chain of thought, collapsed. The length is there for the
    // same reason: these run to a couple of thousand characters.
    reasoning: "reasoning ({n} chars)",
    // WHAT THE LOOP DID, rendered from codes. The harness has no locale -- it
    // does not know which language the member reads -- so it writes `kind` and
    // `status` and these are where they become words. The name, the arguments
    // and the detail are data and are never translated.
    eventTool: "ran",
    eventSubagent: "sub-agent",
    eventModel: "model",
    eventDepth: "thinking deeper",
    eventOk: "ok",
    eventDenied: "not approved",
    eventFailed: "failed",
    // The jump-to-end button, which only exists while the newest message is off-screen.
    // Labelled by what it DOES, not by where it goes ("bottom" names a scroll position;
    // the member is looking for the newest thing said).
    scrollToLatest: "Jump to the latest message",
    // THE DIVIDER, LED BY WHAT WAS GAINED. It used to say what LEFT -- "2 earlier
    // messages are no longer in the agent's context" -- which reads as loss,
    // printed across a conversation the member can still scroll through in full.
    // What happened is the opposite of loss: fewer messages travel with each
    // turn, so the replies after this point cost less and arrive sooner.
    //
    // The count stays because it is the one concrete number here. No token
    // figure: the harness records how many MESSAGES it set aside and not how many
    // tokens that saved, and a number invented for the sentence would be the only
    // unverifiable thing on the screen.
    compactedOne: "Tokens saved — 1 older message is out of the agent's active memory",
    compactedOther: "Tokens saved — {n} older messages are out of the agent's active memory",
    // Without a count -- a record that did not say how many. Rendering "0
    // messages" would claim something false about an event that did happen.
    compactedSome: "Tokens saved — older messages are out of the agent's active memory",
    // EVERYTHING ELSE IS BEHIND A CLICK. This is a status line in the middle of
    // someone's conversation; three sentences of mechanism printed there is a
    // wall between two messages. A member who wants to know asks.
    compactedWhat: "What happened here?",
    compactedWhyLimit:
      "The agent re-reads this whole conversation before every reply, and there is a limit to how much it can hold at once.",
    compactedWhySaves:
      "To stay under that limit, the oldest messages stopped travelling with each turn. That is what makes the replies from here on cheaper and quicker.",
    // THE REASSURANCE. Nothing the member can scroll to has been lost, and the
    // agent can still go and find it -- which is the part that makes this an
    // optimisation rather than forgetting.
    compactedWhyKept:
      "Nothing was deleted. The whole conversation is still on this screen and saved in full, and the agent can search back through it whenever it needs something from earlier.",
  },
  // background-turn-dock: the bar of conversations left running elsewhere.
  //
  // Every label is read inside a narrow segment, so they are short by requirement
  // rather than by preference. The two elapsed phrasings are NOT interchangeable:
  // in-session the number is how long the agent has been quiet (the same number the
  // assistant band shows), while a conversation restored after a reload only knows the
  // total the server reports. Saying "quiet for" about a total would be a lie.
  dock: {
    label: "Conversations running in the background",
    open: "Open {chat}",
    // A parked burst: the member hit send and navigated away inside the debounce
    // window, so the message is still sitting in the composer's queue unsent. It
    // deliberately does not sound like progress -- nothing is running, and the next
    // move is theirs.
    unsent: "Message not sent",
    working: "Working…",
    reconnecting: "Reconnecting…",
    ready: "Reply ready",
    // Distinct from the transcript's own failure banner, which stays where it is: this
    // only says the turn ended without an answer, in the space of a chip.
    failed: "Didn't complete",
    quietFor: "quiet for {t}",
    runningFor: "running for {t}",
    overflow: "+{n} more",
    overflowAria: "Show all background conversations",
    // The collapsed mobile box. A phone-width bar cut into segments truncates the title, the
    // state and the alias into each other, so mobile shows one summary and opens a list.
    summaryOne: "1 conversation in the background",
    summaryOther: "{n} conversations in the background",
    // The qualifier shown when a docked conversation does not belong to the workspace
    // on screen. Without it a bare chat title is ambiguous across agents.
    inAgent: "in {agent}",
    inProject: "in {project}",
  },
  commands: {
    // /rename writes the ALIAS, not the title — hence the wording. "Alias" is
    // the term the rest of the UI uses for it (enrichment.alias, aliasAndTags).
    aliasSet: "Alias set to “{alias}”.",
    aliasCleared: "Alias removed.",
    aliasFailed: "Couldn't set the alias.",
    tagUsage: "Usage: /tag <name> [value] [#color]",
    tagApplied: "Tag “{name}” applied.",
    tagFailed: "Couldn't apply the tag.",
    unknown: "Unknown command: {cmd}. Try /rename or /tag.",
  },
  history: {
    collapseConversations: "Collapse Conversations",
    listView: "List view",
    list: "List",
    treeView: "Tree view",
    treeAria: "Conversation tree",
    tree: "Tree",
    noMatches: "No conversation matches your filter.",
    noMatchesHint:
      "Clear the filter, or narrow it with tag: alias: text: date:.",
    noneYet: "No conversations yet.",
    noneYetHint: "Start one with New chat above and it will show up here.",
    newChat: "New chat",
    newChatBlurb: "Opens an empty composer in the project you are in.",
    // Heading over the conversations that belong to no project — named for what
    // they are, so it reads as a peer of the projects group above it rather than
    // as "everything".
    globalChats: "General chats",
    renameAria: "Rename conversation",
    rename: "Rename",
    deleteAria: "Delete conversation",
    aliasAndTags: "Alias and tags",
    deleteTitle: "Delete chat?",
    deleteMessage: "“{title}” is removed from your list. This can't be undone.",
    deleteFallbackTitle: "This chat",
    titleEmpty: "Title can't be empty.",
    // "{n} messages" -- the singular form is never rendered (the badge only
    // shows for counts above one), but both are kept so the pair is explicit.
    messagesOne: "1 message",
    messagesOther: "{n} messages",
  },
  search: {
    // The prefixes themselves (tag:, alias:, text:, date:) are query syntax and
    // stay literal in every locale; only the chip labels are translated.
    placeholder: "Filter: tag:  alias:  text:  date:",
    tag: "Tag",
    alias: "Alias",
    text: "Text",
    // The first date preset the filter offers. It lived in the canvas copy until the
    // canvas was removed; its only reader has always been the search bar.
    today: "today",
    date: "Date",
  },
  enrichment: {
    tagsOne: "1 tag",
    tagsOther: "{n} tags",
    aliasAria: "Conversation alias",
    saveAlias: "Save alias",
    removeTagPrefix: "Remove tag",
    removeTag: "Remove tag",
    namePlaceholder: "name",
    valuePlaceholder: "value (required)",
    tagNameAria: "Tag name",
    tagValueAria: "Tag value",
    tagColor: "Tag color",
    addTag: "Add tag",
    nameEmpty: "Tag name can't be empty.",
    valueRequired: "Tag value is required.",
  },
  restart: {
    // The proxy ships a reason ENUM, not a sentence, so the phrasing lives here.
    // Each is a consequence, not a mechanism: the reason exists to help someone
    // decide whether to restart now or finish what they were saying.
    reasons: {
      "shared-secret": "An administrator changed a shared credential.",
      "shared-skills": "An administrator changed the shared skills.",
      "shared-files": "An administrator changed the shared files.",
      model: "The model behind your assistant changed.",
      "own-secret": "You saved a secret. It applies after a restart.",
      "admin-request": "An administrator asked for a restart.",
      config: "An administrator changed your assistant's configuration.",
    },
    // A newer proxy may send a reason this build has not learned yet; say the
    // true, useful part rather than nothing.
    reasonUnknown: "Your assistant needs a restart to pick up a recent change.",
    // "{when}" is the scheduled time, formatted in the viewer's locale.
    scheduled: "Your assistant will restart on {when}.",
    now: "Restart now",
    restarting: "Restarting…",
    failed: "Restart failed.",
    sessionExpired: "Your session expired. Sign in again.",
    unreachable: "Could not reach the agent service.",
  },
  // user-owned-models: the member's own model, and which one is answering.
  ownModels: {
    heading: "Model",
    // The collapsed header answers the section's own question: which model is
    // answering. Opening it is then a choice, not a way to find out where you are.
    summaryOrg: "{name}, from your organisation",
    summaryOwn: "{name} — yours",
    summaryBlocked: "Your selection is not being applied",
    summaryLoading: "Checking…",
    summaryUnknown: "Could not be read",
    // The one line the section exists for: what is answering, right now.
    inEffectOrg: "Answering with your organisation's model",
    inEffectOwn: "Answering with your own model",
    // "…, with {name} as an automatic fallback" — the guarantee the test cannot give.
    fallbackNote: "If it fails mid-answer, {name} takes over automatically.",
    noOrgModel: "Your organisation has not set a model for this agent.",
    unnamedOrgModel: "your organisation's model",
    useOrg: "Use my organisation's model",
    useThis: "Use this one",
    inUse: "In use",
    add: "Register a model",
    cancel: "Cancel",
    empty: "You have not registered a model of your own.",
    emptyHint:
      "Register one to use your own provider account. It is yours alone — nobody else can select it.",
    // The switch is inert here, and saying why is the whole point of the state.
    lockedScope:
      "Your administrator does not allow personal models on this agent.",
    lockedSelected:
      "You selected your own model, but your administrator has blocked personal models — {name} is answering instead.",
    disabledSelected:
      "Your administrator disabled this model, so {name} is answering instead.",
    disabledBadge: "Disabled by an administrator",
    labelLabel: "Name it",
    labelPlaceholder: "e.g. My OpenAI key",
    providerLabel: "Provider",
    providerPlaceholder: "Choose a provider",
    modelLabel: "Model",
    modelPlaceholder: "e.g. gpt-5.4",
    apiBaseLabel: "Endpoint URL",
    apiBasePlaceholder: "https://api.openai.com/v1",
    // The mistake this prevents: a base without its version path reaches a real
    // host and answers 404, which reads as "wrong provider".
    apiBaseHint:
      "Filled in when you pick a provider. Keep the version path (e.g. /v1) if you change it.",
    apiBaseFixed:
      "Set by the provider you picked. Your administrator decides whether members may point at an endpoint of their own.",
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "Write-only — never shown again",
    apiKeyKept: "Leave blank to keep the stored key",
    advanced: "Advanced",
    extraBodyLabel: "extra_body (JSON)",
    extraBodyHint:
      "Merged into every request. Leave empty unless your provider requires it.",
    thinkingLabel: "Reasoning depth",
    thinkingHint:
      "How hard this model thinks. The provider default sends nothing \u2014 which is not \u201coff\u201d, a value that gets sent.",
    thinkingDefault: "Provider default",
    test: "Test",
    testing: "Testing…",
    retest: "Test again",
    save: "Save",
    saveAnyway: "Save anyway",
    saving: "Saving…",
    edit: "Edit",
    delete: "Delete",
    deleteConfirm:
      'Delete "{name}"? If it is in use, this agent goes back to your organisation\'s model.',
    // Why Save is disabled. Not a warning — an instruction.
    testFirst: "Test the model before saving it.",
    testOk: "It answered in {ms} ms.",
    // Deliberately not a promise: the container sends tools, streaming and a much
    // larger context than this one short message.
    testOkHint:
      "That proves the endpoint and the key work — not that every answer will.",
    testFailed: "It did not answer.",
    testFailedHint:
      "You can still save it: your organisation's model keeps answering until it works.",
    lastTestOk: "Answered in {ms} ms",
    lastTestFailed: "Last test failed",
    neverTested: "Never tested",
    restartNote:
      "Changes here apply when you restart the agent — the banner at the top of the chat has the button.",
  },
  secrets: {
    title: "Agent secrets",
    // "Saved for <you> on <agent x> — kept across…"
    savedForBefore: "Saved for ",
    savedForYou: "you",
    savedForOn: " on ",
    savedForAfter:
      " — kept across this agent's subscriptions and future sessions, not per conversation. Values are write-only: they are never shown or retrieved. A saved or deleted secret ",
    restartsAgent: "applies when you restart the agent",
    restartsAfter: " — you choose the moment, so a live turn is never cut off.",
    savedNeedsRestart:
      "Saved. It takes effect after a restart — use the banner at the top of the chat when you are ready.",
    // "Delete \"X\"? It applies once you restart the agent."
    deleteConfirm: 'Delete "{name}"? It applies once you restart the agent.',
    nameLabel: "Name",
    namePlaceholder: "e.g. OPENAI_API_KEY",
    valueLabel: "Value",
    valuePlaceholder: "Secret value (write-only)",
    saving: "Saving…",
    save: "Save secret",
    deletePrefix: "Delete",
    invalidName: "Name may only contain letters, numbers, and . _ -",
    valueRequired: "Enter a value.",
    // Each group's header states its own contents, so nobody opens four to find
    // out which one holds anything.
    groupEmpty: "nothing saved",
    groupOne: "1 saved",
    groupMany: "{n} saved",
    // One group per sink. The hint says what the agent actually receives —
    // picking a storage format was the one decision a member had least context
    // for, and naming the file is what makes it a choice rather than a guess.
    formats: {
      dotenv: {
        title: "Environment variables",
        hint: "Written to .env in the agent's read-only .secrets folder — the usual place a tool looks for a credential.",
      },
      json: {
        title: "JSON values",
        hint: "Written to secrets.json in the same folder, for tools that read a JSON object rather than environment variables.",
      },
      file: {
        title: "Files",
        hint: "One file per secret. Kept so you can remove what you saved before.",
        notice:
          "This format is not delivered to the agent right now, so new ones are not offered. Anything here is still yours to delete.",
      },
      native: {
        title: "Picoclaw credentials",
        hint: "Picoclaw's own credential slots, such as the web-search provider.",
        notice:
          "These are set by your tenant or subscription administrator. You can still remove one you saved earlier; new ones have to come from them.",
      },
    },
  },
  uploads: {
    newFolder: "New folder",
    upload: "Upload",
    // Files dragged in from outside the browser land in the workspace without
    // going through a message — this pane is filing, not composing.
    dropToUpload: "Drop to add to this workspace",
    // The system folder's DISPLAYED name. The path on disk stays `attachments` —
    // the proxy owns it — so this is a label, never a rename.
    attachmentsFolder: "Agent deliveries",
    systemFolder: "Managed by the system",
    newFolderPrompt: "Folder name",
    rename: "Rename",
    renameAria: "Rename",
    deleteFolder: "Delete folder",
    deleteFolderAria: "Delete folder",
    organiseHint:
      "Drag files and folders to reorganise. The agent references these paths in its memory and skills — renaming or moving something it mentioned breaks that reference.",
    deleteFolderTitle: "Delete this folder?",
    deleteFolderMessage:
      "{name} and {count} file(s) inside it will be deleted. The agent may reference them.",
    files: "Files",
    // ONE LINE UNDER EACH SECTION'S NAME, back after being deleted in d42e9c7.
    //
    // They were removed for a reason that was right about the surface it was written
    // for: the sidebar's rows are LABELLED, and a row already reading "Files" does not
    // need a sentence saying Files holds files. The collapsed rail is the case that
    // removal did not cover — there the row is a bare glyph, and with `title` replaced
    // by a real tooltip the sentence is the only thing that says what the glyph opens.
    sections: {
      memory: "Standing notes you write for the agent.",
      graph: "What the agent learned on its own.",
      tasks: "What runs on a schedule, and its results.",
      files: "Uploads and files in this workspace.",
      secrets: "Keys the agent uses, and which model answers.",
    },
    refreshAria: "Refresh files",
    refresh: "Refresh",
    filterPlaceholder: "Filter files",
    noMatches: "No files match your filter.",
    noMatchesHint: "Clear the filter to see everything in this workspace.",
    noneYet: "No files yet.",
    noneYetHint:
      "Attach a file in the chat and it lands here, alongside anything the agent writes.",
    deletePrefix: "Delete",
    deleteTitle: "Delete file?",
    deleteMessage:
      "“{name}” is removed from the workspace. The agent can no longer read it.",
    deleteFallbackName: "This file",
  },
  install: {
    action: "Install app",
    // Split around the two <strong> control names Safari itself uses.
    iosHelpBefore: "On iPhone and iPad, tap ",
    iosShare: "Share",
    iosHelpMiddle: " in Safari, then ",
    iosAddToHome: "Add to Home Screen",
    iosHelpAfter:
      ". Safari has no install button of its own — that flow is the install.",
  },
  // ganglion-approval-endpoint: the agent is asking permission and the turn is
  // stopped until this is answered.
  approval: {
    title: "Your agent is asking permission",
    what: "What it would run",
    when: "When",
    // A gated tool this client does not describe. The raw arguments are shown
    // rather than hidden: the member is agreeing to something.
    unknownTool: "It wants to use {tool}, with these arguments:",
    note: "Nothing happens until you answer. If you leave this, it is refused after a few minutes.",
    allow: "Allow",
    refuse: "Refuse",
    reasonPlaceholder: "Why not (optional) — your agent will read this",
  },
  mangrove: {
    title: "Mangrove Network",
    blurb: "Memory shared with you, and memory your agent shared.",
    hint: "The mangrove is where agents share what they learn. Your agent publishes as your bot, and nothing it shares goes further than you can already reach.",
    received: "Received",
    published: "Published",
    pending: "Pending decisions",
    receivedTitle: "Shared with you",
    publishedTitle: "Your agent published",
    heldTitle: "Waiting for you",
    heldHint: "Sent to you directly. It is not in your agent's memory until you admit it.",
    pendingTitle: "Waiting on your decision",
    from: "from {who}",
    evidence: "{n} endorsed",
    admit: "Admit",
    accept: "Accept",
    reject: "Reject",
    advanced: "Advanced options",
    revoke: "Revoke",
    revokeNote: "Revoking tombstones an item. It does not un-deliver anything already shared.",
    none: "Nothing here yet.",
    noneHint: "When your agent shares memory, or somebody shares with you, it appears here.",
    unreachable: "The mangrove is not reachable right now.",
    loadFailed: "Could not read the mangrove.",
    actionFailed: "That did not go through.",
    retry: "Try again",
    people: "People",
    yourIdentity: "Your handles",
    yourIdentityHint: "Send these to somebody who needs to share with you.",
    yourEmail: "Email",
    yourAgentId: "Your agent",
    yourPersonId: "You",
    findPeople: "Find people",
    findHintExact: "Type a whole email address.",
    findHintPrefix: "Type part of an email address.",
    findPlaceholder: "name@example.com",
    find: "Find",
    findNone: "Nobody here matches that.",
    findTooShort: "Type a little more.",
    findFailed: "Could not search right now.",
    shareByEmail: "Share with them by email.",
    sheetFrom: "{who} · {cell}",
    // The card itself is the control, so it has to say what it opens onto.
    openPost: "Read all of “{cell}”",
    compose: "Share something",
    composeHint:
      "Write down what you learned and choose who reads it. Choose nobody and it stays in your own agent's memory.",
    cellLabel: "What it is about",
    cellHint: "A short handle. Everything anybody shares under the same one lines up together.",
    cellPlaceholder: "soil-ph",
    bodyLabel: "What you learned",
    bodyPlaceholder: "e.g. Plot 14 came back at pH 5.2, two months after liming.",
    formatLabel: "Format",
    formatMarkdown: "Markdown",
    formatPlain: "Plain text",
    audienceLabel: "Who reads it",
    audienceNone: "Nobody chosen. This stays in your own agent's memory.",
    addRecipient: "Add",
    removeRecipient: "Remove",
    reachLabel: "What it reaches",
    reachPerson: "Them",
    reachAgent: "Their agent",
    reachBoth: "Both",
    groupsLabel: "Groups",
    groupSubscription: "Everybody in this subscription",
    groupTenant: "Everybody in this tenant",
    groupNote: "Sharing with a group waits on whoever governs it before anything is delivered.",
    publishAction: "Share",
    publishing: "Sharing…",
    publishFailed: "Could not share that right now.",
    publishedOk: "Shared.",
    publishedPending: "Sent for a decision. It reaches the group once whoever governs it accepts.",
    // Sharing something that is not prose: a workspace file, or entities out of the
    // knowledge graph. The mangrove takes exactly one kind per publication, so these
    // REPLACE the cell and body fields rather than sitting beside them.
    attachedHint: "Choose who reads this. Choose nobody and it stays in your own agent's memory.",
    attachedFile: "Sharing a file",
    attachedFileHint: "Your agent reads the file and sends it. Nothing is uploaded from this browser.",
    attachedEntitiesOne: "Sharing 1 entity from your memory graph",
    attachedEntitiesMany: "Sharing {count} entities from your memory graph",
    attachedEntitiesHint: "The relations between them go too.",
    removeAttachment: "Remove",
    shareFile: "Share in the mangrove",
    // A shared piece of somebody's knowledge graph. Shown as what it is — names and
    // counts — because the body underneath is JSON, and JSON says nothing about whether
    // this is worth taking.
    fragmentTitle: "A piece of a memory graph",
    fragmentCounts: "{entities} entities · {observations} observations · {relations} relations",
    fragmentMore: "+{count} more",
    merge: "Merge into my memory",
    merging: "Merging…",
    merged: "Added {entities} entities, {observations} observations and {relations} relations.",
    // Zero of all three. A real outcome, and said out loud: a control that simply
    // stopped being busy would read as a failure.
    mergedNothing: "Nothing new — your agent already knew all of this.",
    mergeFailed: "Could not merge that right now.",
    downloadFile: "Download",
    downloading: "Downloading…",
    downloadFailed: "Could not download that right now.",
    reference: "Reference in chat",
    // The composer it filled is not on this screen, so the click needs an answer here.
    referenced: "Added to your next message.",
    referencedPost: "Referenced memory",
    markerPost: "mangrove memory",
  },
  projects: {
    title: "Projects",
    hint: "A project keeps its own files, memory and instructions, and inherits this agent's model, skills and credentials.",
    // The rail's tooltip, where `hint` runs to four lines in small type beside one-line
    // blurbs. Same claim, tooltip length — it is the sentence a glyph needs, not the
    // paragraph the projects screen can afford.
    blurb: "Chats, files and instructions kept apart by subject.",
    none: "No projects yet.",
    noneHint:
      "Create one to keep a subject's chats, files and instructions apart from the rest.",
    mainAgent: "No project",
    mainAgentHint: "Chats in the agent's own workspace.",
    create: "New project",
    createTitle: "Create project",
    editTitle: "Edit project",
    nameLabel: "Name",
    namePlaceholder: "e.g. Seed trial 2026",
    instructionsLabel: "Instructions",
    instructionsHint:
      "Added to what the agent already knows about itself. Say what this project is and how it should behave here.",
    instructionsPlaceholder:
      "e.g. Always cite the trial protocol and answer with the plot number first.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    edit: "Edit project",
    delete: "Delete project",
    // Deleting takes the workspace with it, so the confirmation names what goes.
    deleteConfirmTitle: "Delete this project?",
    deleteConfirmBody:
      "Its files, memory and every conversation in it are removed. This cannot be undone.",
    deleteConfirm: "Delete",
    // Creating or deleting a project changes the container's mounts, so the
    // agent is rebuilt on the next message. Said plainly rather than letting a
    // first reply just take longer for no visible reason.
    restartNotice: "The agent restarts on your next message.",
    // The badge on the card of the project you are already inside. The grid still
    // renders with a project set, so it has to say which of the cards is where you
    // are standing rather than look like a list you have not chosen from.
    current: "Current",
    // The heading over a project's own conversation list.
    projectChats: "Chats in this project",
    selectorLabel: "Project",
    selectorAria: "Choose the project for this conversation",
    // Shown on an existing conversation: its project is fixed at creation,
    // because the transcripts live in that project's workspace.
    lockedHint: "A conversation stays in the project it started in.",
    unsupported: "This agent does not support projects.",
    refreshAria: "Refresh projects",
  },
};

export type ChatDict = typeof en;

const pt: ChatDict = {
  shell: {
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
    destinations: "Ir para",
    groups: {
      screens: "Telas",
      tools: "Ferramentas",
    },
    conversations: "Conversas",
    path: "Caminho",
    crumbActions: "Ações da conversa",
  },
  landing: {
    title: "Comece uma conversa",
    conversations: "Conversas",
    inProject: "Em {name}",
  },
  pane: {
    expand: "Expandir",
    resize: "Redimensionar",
    close: "Fechar",
  },
  nav: {
    collapseSidebar: "Recolher a barra lateral",
    collapse: "Recolher",
  },
  emptyState: {
    title: "Escolha um workspace para começar",
    body: "Escolha um tenant, uma conta e um agente à esquerda. As conversas dele abrem em um segundo painel, prontas para você escrever.",
  },
  workspaceGrid: {
    title: "Escolha um workspace",
    body: "Tudo o que você pode acessar, agrupado por tenant e assinatura. Clique num agente para abrir uma conversa nova com ele.",
    readOnly: "acesso somente leitura",
  },
  connectivity: {
    title: "Não foi possível falar com o gateway",
    body: "Não conseguimos verificar sua conta agora. A stack está no ar?",
  },
  adminLink: {
    label: "Administração",
  },
  logout: {
    action: "Sair",
    confirmTitle: "Sair?",
    confirmMessage: "Você precisará entrar de novo com um link mágico.",
    pending: "Saindo…",
  },
  workspaceNav: {
    filterPlaceholder: "Filtrar workspaces",
    noMatch: "Nenhum workspace corresponde ao filtro.",
    noMatchHint: "Limpe o filtro para ver tudo o que você pode acessar.",
    none: "Você ainda não está em nenhum workspace.",
    noneHint: "Peça a um operador para adicionar você a um.",
  },
  composer: {
    replyingToBefore: "Respondendo a ",
    replyingToUser: "você",
    replyingToAgent: "o agente",
    replyNoText: "(sem texto)",
    cancelReply: "Cancelar resposta",
    removeAttachment: "Remover",
    slashCommands: "Comandos de barra",
    mentionFiles: "Arquivos do workspace",
    placeholder: "Escreva para o seu agente…",
    placeholderHint:
      "Escreva para o seu agente…  (Shift+Enter para nova linha)",
    attach: "Anexar arquivo",
    uploading: "Enviando…",
    anyFile: "Qualquer arquivo",
    dropToAttach: "Solte para anexar a esta mensagem",
    advancedEditor: "Editor markdown avançado",
    send: "Enviar mensagem",
    stop: "Parar a geração",
    stopping: "Parando…",
  },
  attachment: {
    download: "Baixar arquivo",
    downloading: "Baixando…",
  },
  preview: {
    aria: "Pré-visualização do arquivo",
    action: "Visualizar",
    viewLabel: "Como ler este arquivo",
    viewRendered: "Renderizado",
    viewSource: "Código-fonte",
    wrapLines: "Quebrar linhas longas",
    frontmatter: "Metadados",
    pdfPrev: "Página anterior",
    pdfNext: "Próxima página",
    pdfZoomIn: "Aproximar",
    pdfZoomOut: "Afastar",
    pdfZoomReset: "Ajustar à largura",
    tooLarge:
      "Este arquivo é grande demais para pré-visualizar. Baixe-o para abrir.",
    pdfFallback:
      "Este navegador não consegue exibir o PDF aqui — baixe o arquivo.",
    sheetTruncated:
      "Mostrando as primeiras {n} linhas. Baixe o arquivo para ver todas.",
    slidesPartial:
      "Texto extraído dos slides. Baixe o arquivo para ver a apresentação.",
    scriptsOff: "Scripts desligados. Esta página pode não aparecer como foi feita.",
    scriptsEnable: "Executar scripts",
    scriptsOn: "Scripts estão rodando nesta pré-visualização, nesta sessão.",
    scriptsDisable: "Desligar",
    scriptsTitle: "Executar scripts nas pré-visualizações?",
    scriptsRisk:
      "Esta página foi escrita pelo agente a partir de material que ele não controlava. Com scripts ligados ela pode enviar o conteúdo do documento para qualquer endereço da internet, e alcançar hosts que o seu navegador enxerga e os nossos servidores não.",
    scriptsSafe:
      "Sua sessão, seus cookies e o resto deste aplicativo continuam fora do alcance dela — a pré-visualização não tem acesso a nada disso.",
    scriptsScope:
      "Isso vale para todo arquivo HTML que você abrir até fechar o navegador, inclusive os que o agente baixar depois.",
    slide: "Slide {n}",
    binary: "Este arquivo não é texto. Baixe-o para abrir.",
  },
  markdownEditor: {
    aria: "Editor markdown",
    heading: "Editor markdown",
    previewEmpty: "A prévia aparece aqui.",
    saveDraft: "Salvar rascunho",
    hidePreview: "Ocultar prévia",
    showPreview: "Mostrar prévia",
    closeTitle: "Fechar (Esc)",
    placeholder:
      "Escreva em markdown…  (Ctrl/⌘+Enter para enviar, Esc para fechar)",
    tools: {
      heading: "Título",
      bold: "Negrito",
      italic: "Itálico",
      inlineCode: "Código em linha",
      codeBlock: "Bloco de código",
      bulletedList: "Lista com marcadores",
      numberedList: "Lista numerada",
      quote: "Citação",
      link: "Link",
      table: "Tabela",
    },
  },
  memory: {
    title: "Memória do workspace",
    hint: "Salvo em MEMORY_CUSTOM.md — o agente lê a cada mensagem.",
    saved: "Salvo",
    placeholder:
      "ex.: Sempre responda em português. Nossa stack é Next.js + Go…",
  },
  scheduledTasks: {
    title: "Tarefas agendadas",
    hint: "O que o agente executa em horários programados, e o que cada execução produziu. Somente leitura: peça ao agente para criar ou alterar uma tarefa.",
    noOutcomeHint:
      "Só a execução mais recente de uma tarefa ativa registra status — as anteriores mostram quanto tempo levaram e quanto registraram.",
    schedule: {
      cron: "Cron {expr}",
      every: "A cada {interval}",
      at: "Uma vez em {instant}",
      unknown: "Agendamento: {kind}",
    },
    disabled: "Desabilitada",
    inert: "Estas tarefas não estão sendo executadas",
    inertHint:
      "Esta instância é desligada quando fica ociosa, e um agendamento só dispara enquanto ela está no ar. As tarefas abaixo continuam registradas — um administrador precisa mudar esta instância para contínua para que voltem a rodar.",
    nextRun: "Próxima execução",
    lastRun: "Última execução",
    neverRan: "Ainda não executou",
    lastStatus: "Status",
    lastErrorLabel: "Erro",
    deliversTo: "Entrega em {target}",
    oneShot: "Se remove depois de executar",
    runs: "{count} execução(ões)",
    noRuns: "Nenhuma execução registrada.",
    entries: "{count} entradas",
    removedTask: "Tarefa removida",
    removedTaskHint:
      "A tarefa não está mais agendada, mas esta execução continua registrada.",
    transcriptMissing: "O transcript desta execução não está mais disponível.",
    backToTasks: "Voltar às tarefas",
    toolCall: "{name}",
    toolResult: "Resultado da ferramenta",
    expandTool: "Mostrar detalhes",
    collapseTool: "Ocultar detalhes",
    reference: "Referenciar no chat",
    referenceAria: "Referenciar isto no chat",
    referencedTask: "Tarefa agendada",
    referencedRun: "Execução da tarefa",
    cancelReference: "Remover referência",
    markerTask: "tarefa agendada",
    markerRun: "execução",
    markerLastRun: "última execução",
    none: "Nenhuma tarefa agendada ainda.",
    noneHint: "Peça ao agente para agendar algo e aparecerá aqui.",
    refresh: "Buscar novas tarefas",
    refreshAria: "Atualizar tarefas agendadas",
    hideFinished: "Ocultar concluídas",
    hideFinishedTitle:
      "Ocultar tarefas que já executaram e não executarão de novo",
    finishedHidden: "{count} oculta(s)",
    allFinished: "Tudo aqui já foi concluído.",
    allFinishedHint:
      "Desmarque “Ocultar concluídas” para ver as tarefas passadas e seus resultados.",
    showMoreRuns: "Mostrar {count} execução(ões) mais antiga(s)",
    showMore: "ver mais",
    showLess: "ver menos",
    showFewerRuns: "Mostrar menos execuções",
  },
  memoryGraph: {
    title: "Grafo de conhecimento",
    open: "Abrir o grafo de conhecimento",
    refresh: "Atualizar",
    refreshAria: "Atualizar o grafo de conhecimento",
    hint: "O que o agente aprendeu por conta própria — entidades, como se relacionam e as observações por trás de cada uma. Somente leitura: o agente escreve, você confere.",
    tabs: {
      browse: "Entidades",
      map: "Mapa",
      search: "Busca",
      recent: "Recentes",
    },
    expandMap: "Expandir o mapa para tela cheia",
    collapseMap: "Sair da tela cheia",
    spreadOut: "Espalhar mais os nós",
    spreadIn: "Aproximar os nós",
    fitMap: "Enquadrar o grafo todo",
    spreadReadout: "espalhar {value}x",
    mapFilterPlaceholder: "Filtrar entidades por nome",
    mapTruncated: "{count} não exibidos — filtre para reduzir",
    searchPlaceholder: "Buscar no grafo…",
    searchHint:
      "Ranqueado por relevância de termos (BM25), então não precisa acertar as palavras exatas. Não entende sinônimos.",
    searchIdle: {
      title: "Busque no grafo",
      body: "Digite um termo e aperte Enter para procurar em todas as entidades e observações que o agente guardou.",
    },
    observations: "observações",
    relations: "relações",
    noResults: "Nada corresponde a essa busca.",
    noResultsHint:
      "O ranqueamento é por relevância de termos, não por significado — tente as palavras que o agente teria guardado.",
    mapNoMatch: "Nenhuma entidade corresponde ao filtro.",
    mapNoMatchHint:
      "O filtro do mapa compara só nomes. Limpe o campo para ver o grafo inteiro.",
    noObservations: "Nenhuma observação registrada ainda.",
    confidence: "confiança",
    archived: "Arquivada — oculta da navegação do próprio agente.",
    allTypes: "Todos",
    noneOfType: "Nada desse tipo.",
    noneOfTypeHint: "Escolha Todos acima para ver todas as entidades de novo.",
    closeDetail: "Fechar detalhes",
    resizeDetail: "Redimensionar o painel de detalhes",
    sources: "De onde isso veio",
    sourcesHint: "Clique numa conversa para abri-la.",
    noSources:
      "Nenhuma conversa registrada. O agente grava sem origem quando foi uma tarefa agendada, ou quando havia dois chats abertos ao mesmo tempo.",
    goneConversation: "Conversa não está mais disponível",
    mergedInto: "Fundida em",
    referenceEntity: "Referenciar esta entidade no chat",
    referencedEntity: "Entidade referenciada",
    markerEntity: "entidade do grafo",
    selection: {
      selectEntity: "Selecionar {name}",
      one: "1 entidade selecionada",
      many: "{count} entidades selecionadas",
      hidden: "{count} fora da visão",
      share: "Compartilhar no mangue",
      clear: "Limpar seleção",
    },
    empty: {
      title: "Nada aprendido ainda",
      body: "O agente constrói isso conversando com você. Peça para ele lembrar de algo e vai aparecer aqui.",
    },
    recentCopy: {
      learned: "Aprendido nas últimas 24h",
      newEntities: "Novas entidades",
      newRelations: "Novas relações",
      nothing: "Nada novo nas últimas 24 horas.",
      nothingHint:
        "O agente alimenta o grafo conforme vocês conversam — a aba Entidades mostra tudo o que ele já sabe.",
    },
    mapTools: {
      open: "Ferramentas de descoberta",
      close: "Esconder as ferramentas",
      filters: "Filtros",
      relationTypes: "Tipos de relação",
      relationTypesAll: "Todas as relações",
      relationTypesNone:
        "Nenhum tipo de relação selecionado — as entidades aparecem sem suas conexões.",
      noRelationTypes: "O agente ainda não registrou nenhuma relação.",
      minObservations: "Pelo menos {count} observações",
      minObservationsAny: "Qualquer número de observações",
      focus: "Foco",
      focusHops: "{count} salto",
      focusHopsPlural: "{count} saltos",
      focusHint:
        "Até onde, a partir da entidade selecionada, o grafo permanece aceso.",
      legend: "Legenda",
      legendHiddenByFilter: "escondido pelo filtro atual",
      legendClear: "Mostrar todos os tipos de novo",
      hoverType: "tipo",
      encoding: "Codificação",
      sizeBy: "Tamanho mostra",
      colorBy: "Cor mostra",
      sizeObservations: "Observações",
      sizeDegree: "Conexões",
      sizePagerank: "Influência",
      sizeBetweenness: "Ponte",
      sizePagerankHint:
        "Quanto do grafo passa por uma entidade, contando também a importância de suas vizinhas.",
      sizeBetweennessHint:
        "Com que frequência uma entidade está no único caminho entre duas outras. Calculado sob demanda — é o pesado.",
      colorType: "Tipo de entidade",
      colorCommunity: "Agrupamento",
      colorComponent: "Grupo conectado",
      colorCommunityHint:
        "Grupos que o agente nunca rotulou, inferidos de quão densamente as entidades se relacionam.",
      colorComponentHint:
        "Entidades alcançáveis entre si. Cores diferentes nunca se conectam.",
      insights: "Descobertas",
      insightsTop: "Mais fortes por {metric}",
      insightsOffMap: "fora do mapa",
      insightsIsolated: "{count} isoladas — conhecidas mas nunca conectadas",
      insightsIsolatedOne: "1 isolada — conhecida mas nunca conectada",
      insightsIsolatedNone: "Tudo o que o agente sabe se conecta a algo.",
      insightsScope:
        "Medido no grafo inteiro, não apenas no que está desenhado.",
      path: "Caminho",
      pathEnable: "Traçar um caminho",
      pathDisable: "Parar de traçar",
      pathPickFirst: "Escolha a primeira entidade no mapa.",
      pathPickSecond: "Agora escolha a segunda.",
      pathFrom: "De",
      pathClear: "Começar de novo",
      pathUndirectedHint:
        "Segue as relações em qualquer direção, independente de para onde as setas apontam.",
      pathUnreachable: "Nada no mapa conecta essas duas.",
      pathUnreachableHint:
        "Elas ainda podem se relacionar por uma entidade que o filtro ou o limite de nós deixou de fora.",
      pathMissing: "{names} não está no mapa agora.",
      pathMissingHint:
        "Limpe o filtro, ou aumente o que o mapa mostra, e trace de novo.",
      pathSame: "Essa é a mesma entidade duas vezes.",
      scopeNames: "Nomes",
      scopeContents: "Conteúdo",
      scopeLabel: "O filtro busca em",
      scopeNamesHint: "Instantâneo, e só casa com o nome da entidade.",
      scopeContentsHint:
        "Consulta o servidor e também lê o que o agente observou sobre cada entidade.",
      scopeSearching: "Buscando…",
      scopeFailed: "Não foi possível concluir essa busca.",
      scopeCapped:
        "Mostrando as {count} melhores correspondências — pode haver mais.",
      reset: "Restaurar tudo",
      resetHint:
        "Limpa os filtros, as codificações, o raio de foco e o filtro de tipo compartilhado com a aba Entidades.",
      resetNothing: "Nada para restaurar — tudo está no padrão.",
    },
    mapNoMatchContents: "Nada que o agente observou corresponde a isso.",
    mapNoMatchContentsHint:
      "Esta busca cobriu nomes, tipos e o texto das observações. Tente as palavras que o agente teria guardado.",
  },
  view: {
    quoteUser: "Você",
    quoteAgent: "Agente",
    replyAria: "Responder a esta mensagem",
    reply: "Responder",
    agentPrefix: "agente",
    retrying:
      "Não foi possível falar com o gateway — tentando de novo… (tentativa {n} de {total})",
    settling: "Estamos guardando o arquivo para você…",
    resumeHeading: "Continue de onde parou",
    resumeBody: "Volte para sua conversa mais recente com o agente {agent}.",
    resumeBodyProject: "Volte para sua conversa mais recente neste projeto.",
    startHeading: "Comece uma nova conversa",
    startBody: "Pergunte qualquer coisa ao agente {agent} para começar.",
    startBodyProject: "Pergunte qualquer coisa neste projeto para começar.",
    agentPulse: "Pulso do agente",
    thinking: "Pensando…",
    working: "Ainda trabalhando…",
    recovering:
      "A conexão caiu — o agente continua trabalhando. Buscando a resposta…",
    offline:
      "Você está sem conexão — o agente continua trabalhando. Reconectando assim que a internet voltar…",
    steering:
      "Enviada para o turno que já estava em andamento — o agente vai levá-la em conta. O que vem abaixo é a resposta desse turno.",
    queuedBehind:
      "Esta conversa já tinha um turno em andamento, então o seu está esperando por ele. A resposta abaixo é a desta mensagem.",
    usingTool: "Usando {tool}",
    queued: "Aguardando envio",
    stepOne: "1 passo",
    stepsOther: "{n} passos",
    reasoning: "raciocínio ({n} chars)",
    eventTool: "executou",
    eventSubagent: "subagente",
    eventModel: "modelo",
    eventDepth: "pensando mais fundo",
    eventOk: "ok",
    eventDenied: "não aprovado",
    eventFailed: "falhou",
    scrollToLatest: "Ir para a mensagem mais recente",
    compactedOne: "Tokens economizados — 1 mensagem antiga saiu da memória ativa do agente",
    compactedOther:
      "Tokens economizados — {n} mensagens antigas saíram da memória ativa do agente",
    compactedSome:
      "Tokens economizados — mensagens antigas saíram da memória ativa do agente",
    compactedWhat: "O que aconteceu aqui?",
    compactedWhyLimit:
      "O agente relê esta conversa inteira antes de cada resposta, e há um limite de quanto ele consegue segurar de uma vez.",
    compactedWhySaves:
      "Para caber nesse limite, as mensagens mais antigas deixaram de viajar junto a cada turno. É isso que torna as respostas daqui em diante mais baratas e mais rápidas.",
    compactedWhyKept:
      "Nada foi apagado. A conversa inteira continua nesta tela e salva por completo, e o agente pode buscar nela sempre que precisar de algo do começo.",
  },
  dock: {
    label: "Conversas rodando em segundo plano",
    open: "Abrir {chat}",
    unsent: "Mensagem não enviada",
    working: "Trabalhando…",
    reconnecting: "Reconectando…",
    ready: "Resposta pronta",
    failed: "Não concluiu",
    quietFor: "em silêncio há {t}",
    runningFor: "rodando há {t}",
    overflow: "+{n} outras",
    overflowAria: "Mostrar todas as conversas em segundo plano",
    summaryOne: "1 conversa em segundo plano",
    summaryOther: "{n} conversas em segundo plano",
    inAgent: "em {agent}",
    inProject: "em {project}",
  },
  commands: {
    aliasSet: "Apelido definido: “{alias}”.",
    aliasCleared: "Apelido removido.",
    aliasFailed: "Não consegui definir o apelido.",
    tagUsage: "Uso: /tag <nome> [valor] [#cor]",
    tagApplied: "Tag “{name}” aplicada.",
    tagFailed: "Não consegui aplicar a tag.",
    unknown: "Comando desconhecido: {cmd}. Tente /rename ou /tag.",
  },
  history: {
    collapseConversations: "Recolher Conversas",
    listView: "Visão em lista",
    list: "Lista",
    treeView: "Visão em árvore",
    treeAria: "Árvore de conversas",
    tree: "Árvore",
    noMatches: "Nenhuma conversa corresponde ao filtro.",
    noMatchesHint: "Limpe o filtro, ou refine com tag: alias: text: date:.",
    noneYet: "Nenhuma conversa ainda.",
    noneYetHint: "Comece uma em Nova conversa, acima, e ela aparece aqui.",
    newChat: "Nova conversa",
    newChatBlurb: "Abre um compositor vazio no projeto em que você está.",
    globalChats: "Conversas gerais",
    renameAria: "Renomear conversa",
    rename: "Renomear",
    deleteAria: "Excluir conversa",
    aliasAndTags: "Apelido e tags",
    deleteTitle: "Excluir conversa?",
    deleteMessage: "“{title}” sai da sua lista. Isso não pode ser desfeito.",
    deleteFallbackTitle: "Esta conversa",
    titleEmpty: "O título não pode ficar vazio.",
    messagesOne: "1 mensagem",
    messagesOther: "{n} mensagens",
  },
  search: {
    placeholder: "Filtrar: tag:  alias:  text:  date:",
    tag: "Tag",
    alias: "Apelido",
    text: "Texto",
    today: "hoje",
    date: "Data",
  },
  enrichment: {
    tagsOne: "1 tag",
    tagsOther: "{n} tags",
    aliasAria: "Apelido da conversa",
    saveAlias: "Salvar apelido",
    removeTagPrefix: "Remover tag",
    removeTag: "Remover tag",
    namePlaceholder: "nome",
    valuePlaceholder: "valor (obrigatório)",
    tagNameAria: "Nome da tag",
    tagValueAria: "Valor da tag",
    tagColor: "Cor da tag",
    addTag: "Adicionar tag",
    nameEmpty: "O nome da tag não pode ficar vazio.",
    valueRequired: "O valor da tag é obrigatório.",
  },
  restart: {
    reasons: {
      "shared-secret": "Um administrador alterou uma credencial compartilhada.",
      "shared-skills": "Um administrador alterou as skills compartilhadas.",
      "shared-files": "Um administrador alterou os arquivos compartilhados.",
      model: "O modelo por trás do seu assistente mudou.",
      "own-secret":
        "Você salvou um segredo. Ele passa a valer após um reinício.",
      "admin-request": "Um administrador pediu um reinício.",
      config: "Um administrador alterou a configuração do seu assistente.",
    },
    reasonUnknown:
      "Seu assistente precisa reiniciar para aplicar uma alteração recente.",
    scheduled: "Seu assistente vai reiniciar em {when}.",
    now: "Reiniciar agora",
    restarting: "Reiniciando…",
    failed: "Falha ao reiniciar.",
    sessionExpired: "Sua sessão expirou. Entre novamente.",
    unreachable: "Não foi possível alcançar o serviço do agente.",
  },
  ownModels: {
    heading: "Modelo",
    summaryOrg: "{name}, da sua organização",
    summaryOwn: "{name} — seu",
    summaryBlocked: "Sua seleção não está sendo aplicada",
    summaryLoading: "Verificando…",
    summaryUnknown: "Não foi possível ler",
    inEffectOrg: "Respondendo com o modelo da sua organização",
    inEffectOwn: "Respondendo com o seu próprio modelo",
    fallbackNote:
      "Se ele falhar no meio de uma resposta, {name} assume automaticamente.",
    noOrgModel: "Sua organização não definiu um modelo para este agente.",
    unnamedOrgModel: "o modelo da sua organização",
    useOrg: "Usar o modelo da minha organização",
    useThis: "Usar este",
    inUse: "Em uso",
    add: "Registrar um modelo",
    cancel: "Cancelar",
    empty: "Você ainda não registrou um modelo próprio.",
    emptyHint:
      "Registre um para usar a sua própria conta no provedor. Ele é só seu — ninguém mais pode selecioná-lo.",
    lockedScope: "Seu administrador não permite modelos próprios neste agente.",
    lockedSelected:
      "Você selecionou o seu modelo, mas seu administrador bloqueou modelos próprios — quem está respondendo é {name}.",
    disabledSelected:
      "Seu administrador desativou este modelo, então quem está respondendo é {name}.",
    disabledBadge: "Desativado por um administrador",
    labelLabel: "Dê um nome",
    labelPlaceholder: "ex.: Minha chave da OpenAI",
    providerLabel: "Provedor",
    providerPlaceholder: "Escolha um provedor",
    modelLabel: "Modelo",
    modelPlaceholder: "ex.: gpt-5.4",
    apiBaseLabel: "URL do endpoint",
    apiBasePlaceholder: "https://api.openai.com/v1",
    apiBaseHint:
      "Preenchida ao escolher o provedor. Se você trocar, mantenha o caminho da versão (ex.: /v1).",
    apiBaseFixed:
      "Definida pelo provedor escolhido. Seu administrador decide se membros podem apontar para um endpoint próprio.",
    apiKeyLabel: "Chave de API",
    apiKeyPlaceholder: "Somente escrita — nunca mais exibida",
    apiKeyKept: "Deixe em branco para manter a chave já salva",
    advanced: "Avançado",
    extraBodyLabel: "extra_body (JSON)",
    extraBodyHint:
      "Mesclado em toda requisição. Deixe vazio, a não ser que seu provedor exija.",
    thinkingLabel: "Profundidade de raciocínio",
    thinkingHint:
      "Quanto este modelo pensa. O padrão do provedor não envia nada \u2014 o que não é \u201coff\u201d, que é um valor enviado.",
    thinkingDefault: "Padrão do provedor",
    test: "Testar",
    testing: "Testando…",
    retest: "Testar de novo",
    save: "Salvar",
    saveAnyway: "Salvar mesmo assim",
    saving: "Salvando…",
    edit: "Editar",
    delete: "Excluir",
    deleteConfirm:
      'Excluir "{name}"? Se estiver em uso, este agente volta para o modelo da sua organização.',
    testFirst: "Teste o modelo antes de salvar.",
    testOk: "Respondeu em {ms} ms.",
    testOkHint:
      "Isso prova que o endpoint e a chave funcionam — não que toda resposta vai funcionar.",
    testFailed: "Não respondeu.",
    testFailedHint:
      "Você ainda pode salvar: o modelo da sua organização continua respondendo até funcionar.",
    lastTestOk: "Respondeu em {ms} ms",
    lastTestFailed: "Último teste falhou",
    neverTested: "Nunca testado",
    restartNote:
      "As mudanças aqui passam a valer quando você reiniciar o agente — o botão está no aviso do topo do chat.",
  },
  secrets: {
    title: "Segredos do agente",
    savedForBefore: "Salvo para ",
    savedForYou: "você",
    savedForOn: " no ",
    savedForAfter:
      " — mantido entre as assinaturas deste agente e sessões futuras, não por conversa. Os valores são somente escrita: nunca são exibidos nem recuperados. Um segredo salvo ou excluído ",
    restartsAgent: "passa a valer quando você reiniciar o agente",
    restartsAfter:
      " — você escolhe a hora, então um turno em andamento nunca é cortado.",
    savedNeedsRestart:
      "Salvo. Passa a valer após um reinício — use o aviso no topo do chat quando quiser.",
    deleteConfirm:
      'Excluir "{name}"? Passa a valer quando você reiniciar o agente.',
    nameLabel: "Nome",
    namePlaceholder: "ex.: OPENAI_API_KEY",
    valueLabel: "Valor",
    valuePlaceholder: "Valor do segredo (somente escrita)",
    saving: "Salvando…",
    save: "Salvar segredo",
    deletePrefix: "Excluir",
    invalidName: "O nome só pode conter letras, números e . _ -",
    valueRequired: "Informe um valor.",
    groupEmpty: "nada salvo",
    groupOne: "1 salvo",
    groupMany: "{n} salvos",
    formats: {
      dotenv: {
        title: "Variáveis de ambiente",
        hint: "Gravado no .env da pasta .secrets do agente (somente leitura) — o lugar onde uma ferramenta costuma procurar uma credencial.",
      },
      json: {
        title: "Valores JSON",
        hint: "Gravado no secrets.json da mesma pasta, para ferramentas que leem um objeto JSON em vez de variáveis de ambiente.",
      },
      file: {
        title: "Arquivos",
        hint: "Um arquivo por segredo. Mantido aqui para você remover o que salvou antes.",
        notice:
          "Este formato não está sendo entregue ao agente no momento, então não oferecemos novos. O que está aqui continua sendo seu para excluir.",
      },
      native: {
        title: "Credenciais do picoclaw",
        hint: "Os slots de credencial do próprio picoclaw, como o provedor de busca na web.",
        notice:
          "São definidas pelo administrador do seu tenant ou da sua assinatura. Você ainda pode remover uma que salvou antes; novas precisam vir deles.",
      },
    },
  },
  uploads: {
    newFolder: "Nova pasta",
    upload: "Enviar",
    dropToUpload: "Solte para adicionar a este workspace",
    attachmentsFolder: "Entregas do agente",
    systemFolder: "Gerenciada pelo sistema",
    newFolderPrompt: "Nome da pasta",
    rename: "Renomear",
    renameAria: "Renomear",
    deleteFolder: "Excluir pasta",
    deleteFolderAria: "Excluir pasta",
    organiseHint:
      "Arraste arquivos e pastas para reorganizar. O agente referencia esses caminhos na memória e nas skills — renomear ou mover algo que ele citou quebra a referência.",
    deleteFolderTitle: "Excluir esta pasta?",
    deleteFolderMessage:
      "{name} e {count} arquivo(s) dentro dela serão excluídos. O agente pode referenciá-los.",
    files: "Arquivos",
    sections: {
      memory: "Notas fixas que você escreve para o agente.",
      graph: "O que o agente aprendeu por conta própria.",
      tasks: "O que roda em horário programado, e seus resultados.",
      files: "Uploads e arquivos deste workspace.",
      secrets: "Chaves que o agente usa, e qual modelo responde.",
    },
    refreshAria: "Atualizar arquivos",
    refresh: "Atualizar",
    filterPlaceholder: "Filtrar arquivos",
    noMatches: "Nenhum arquivo corresponde ao filtro.",
    noMatchesHint: "Limpe o filtro para ver tudo o que há neste workspace.",
    noneYet: "Nenhum arquivo ainda.",
    noneYetHint:
      "Anexe um arquivo no chat e ele aparece aqui, junto com o que o agente escrever.",
    deletePrefix: "Excluir",
    deleteTitle: "Excluir arquivo?",
    deleteMessage: "“{name}” sai do workspace. O agente não poderá mais lê-lo.",
    deleteFallbackName: "Este arquivo",
  },
  install: {
    action: "Instalar app",
    iosHelpBefore: "No iPhone e no iPad, toque em ",
    iosShare: "Compartilhar",
    iosHelpMiddle: " no Safari e depois em ",
    iosAddToHome: "Adicionar à Tela de Início",
    iosHelpAfter:
      ". O Safari não tem um botão de instalar próprio — esse é o fluxo de instalação.",
  },
  approval: {
    title: "Seu agente está pedindo permissão",
    what: "O que ele rodaria",
    when: "Quando",
    unknownTool: "Ele quer usar {tool}, com estes argumentos:",
    note: "Nada acontece até você responder. Se deixar passar, é recusado depois de alguns minutos.",
    allow: "Permitir",
    refuse: "Recusar",
    reasonPlaceholder: "Por que não (opcional) — seu agente vai ler isto",
  },
  mangrove: {
    title: "Rede Mangue",
    blurb: "Memoria compartilhada com voce, e a que seu agente compartilhou.",
    hint: "O mangue e onde os agentes compartilham o que aprendem. Seu agente publica como bot seu, e nada do que ele compartilha vai alem do que voce ja alcanca.",
    received: "Recebidos",
    published: "Publicados",
    pending: "Decisoes pendentes",
    receivedTitle: "Compartilhado com voce",
    publishedTitle: "Seu agente publicou",
    heldTitle: "Esperando por voce",
    heldHint: "Enviado direto a voce. So entra na memoria do seu agente quando voce admitir.",
    pendingTitle: "Esperando sua decisao",
    from: "de {who}",
    evidence: "{n} apoiaram",
    admit: "Admitir",
    accept: "Aceitar",
    reject: "Recusar",
    advanced: "Opções avançadas",
    revoke: "Revogar",
    revokeNote: "Revogar marca o item como removido. Nao desfaz o que ja foi entregue.",
    none: "Nada aqui ainda.",
    noneHint: "Quando seu agente compartilhar memoria, ou alguem compartilhar com voce, aparece aqui.",
    unreachable: "O mangue nao esta acessivel agora.",
    loadFailed: "Nao foi possivel ler o mangue.",
    actionFailed: "Nao deu certo.",
    retry: "Tentar de novo",
    people: "Pessoas",
    yourIdentity: "Suas identificacoes",
    yourIdentityHint: "Envie isto a quem precisar compartilhar com voce.",
    yourEmail: "E-mail",
    yourAgentId: "Seu agente",
    yourPersonId: "Voce",
    findPeople: "Encontrar pessoas",
    findHintExact: "Digite um e-mail inteiro.",
    findHintPrefix: "Digite parte de um e-mail.",
    findPlaceholder: "nome@exemplo.com",
    find: "Buscar",
    findNone: "Ninguem aqui corresponde a isso.",
    findTooShort: "Digite um pouco mais.",
    findFailed: "Nao foi possivel buscar agora.",
    shareByEmail: "Compartilhe com essa pessoa por e-mail.",
    sheetFrom: "{who} · {cell}",
    openPost: "Ler tudo de “{cell}”",
    compose: "Compartilhar algo",
    composeHint:
      "Escreva o que você aprendeu e escolha quem lê. Sem escolher ninguém, fica só na memória do seu agente.",
    cellLabel: "Sobre o que é",
    cellHint: "Um identificador curto. Tudo que for compartilhado com o mesmo se junta no mesmo lugar.",
    cellPlaceholder: "ph-do-solo",
    bodyLabel: "O que você aprendeu",
    bodyPlaceholder: "ex.: A parcela 14 voltou com pH 5,2, dois meses depois da calagem.",
    formatLabel: "Formato",
    formatMarkdown: "Markdown",
    formatPlain: "Texto simples",
    audienceLabel: "Quem lê",
    audienceNone: "Ninguém escolhido. Isto fica só na memória do seu agente.",
    addRecipient: "Adicionar",
    removeRecipient: "Remover",
    reachLabel: "O que isso alcança",
    reachPerson: "A pessoa",
    reachAgent: "O agente dela",
    reachBoth: "Os dois",
    groupsLabel: "Grupos",
    groupSubscription: "Todo mundo desta assinatura",
    groupTenant: "Todo mundo deste tenant",
    groupNote: "Compartilhar com um grupo espera quem governa o grupo antes de entregar qualquer coisa.",
    publishAction: "Compartilhar",
    publishing: "Compartilhando…",
    publishFailed: "Não foi possível compartilhar agora.",
    publishedOk: "Compartilhado.",
    publishedPending: "Enviado para decisão. Chega ao grupo quando quem o governa aceitar.",
    attachedHint: "Escolha quem lê isto. Sem escolher ninguém, fica só na memória do seu agente.",
    attachedFile: "Compartilhando um arquivo",
    attachedFileHint: "Seu agente lê o arquivo e o envia. Nada sobe deste navegador.",
    attachedEntitiesOne: "Compartilhando 1 entidade do seu grafo de memória",
    attachedEntitiesMany: "Compartilhando {count} entidades do seu grafo de memória",
    attachedEntitiesHint: "As relações entre elas vão junto.",
    removeAttachment: "Remover",
    shareFile: "Compartilhar no mangue",
    fragmentTitle: "Um pedaço de um grafo de memória",
    fragmentCounts: "{entities} entidades · {observations} observações · {relations} relações",
    fragmentMore: "+{count} a mais",
    merge: "Juntar à minha memória",
    merging: "Juntando…",
    merged: "Entraram {entities} entidades, {observations} observações e {relations} relações.",
    mergedNothing: "Nada novo — seu agente já sabia de tudo isso.",
    mergeFailed: "Não foi possível juntar agora.",
    downloadFile: "Baixar",
    downloading: "Baixando…",
    downloadFailed: "Não foi possível baixar agora.",
    reference: "Citar na conversa",
    referenced: "Adicionado à sua próxima mensagem.",
    referencedPost: "Memória citada",
    markerPost: "memória do mangue",
  },
  projects: {
    title: "Projetos",
    hint: "Um projeto guarda arquivos, memória e instruções próprios, e herda o modelo, as skills e as credenciais deste agente.",
    blurb: "Conversas, arquivos e instruções separados por assunto.",
    none: "Nenhum projeto ainda.",
    noneHint:
      "Crie um para manter as conversas, os arquivos e as instruções de um assunto separados do resto.",
    mainAgent: "Sem projeto",
    mainAgentHint: "Conversas no workspace do próprio agente.",
    create: "Novo projeto",
    createTitle: "Criar projeto",
    editTitle: "Editar projeto",
    nameLabel: "Nome",
    namePlaceholder: "ex.: Ensaio de sementes 2026",
    instructionsLabel: "Instruções",
    instructionsHint:
      "Somadas ao que o agente já sabe sobre si. Diga o que é este projeto e como ele deve se comportar aqui.",
    instructionsPlaceholder:
      "ex.: Sempre cite o protocolo do ensaio e responda começando pelo número da parcela.",
    save: "Salvar",
    saving: "Salvando…",
    cancel: "Cancelar",
    edit: "Editar projeto",
    delete: "Excluir projeto",
    deleteConfirmTitle: "Excluir este projeto?",
    deleteConfirmBody:
      "Os arquivos, a memória e todas as conversas dele são removidos. Não dá para desfazer.",
    deleteConfirm: "Excluir",
    restartNotice: "O agente reinicia na sua próxima mensagem.",
    current: "Atual",
    projectChats: "Conversas deste projeto",
    selectorLabel: "Projeto",
    selectorAria: "Escolher o projeto desta conversa",
    lockedHint: "Uma conversa permanece no projeto em que começou.",
    unsupported: "Este agente não suporta projetos.",
    refreshAria: "Atualizar projetos",
  },
};

export const chatCopy: Record<Locale, ChatDict> = { en, pt };
