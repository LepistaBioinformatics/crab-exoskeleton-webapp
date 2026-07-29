import type { Locale } from "./config";

// Copy for /admin, sub-keyed by panel.
//
// Tab *keys* ("files", "secrets", "skills", "model", "members", "branding")
// are the `?tab=` URL values and the fixtures in tabs.test.ts -- they are
// identifiers and are never translated. Only the labels below are.
//
// Likewise untranslated: secret formats (dotenv/json/file/native), model and
// agent identifiers, and provider names. They land in config files verbatim.

const en = {
  shell: {
    heading: "Administration",
    backToChat: "Back to chat",
    noSubscriptionsManaged:
      "You don't manage any subscriptions directly, so there are no member workspaces to list here.",
    selectScope: "Select a scope on the left to manage it.",

    areaAria: "Admin area",
    // Was "Scoped actions". That name described the old model, in which the scope
    // came first and the agent was a setting inside each section.
    agents: "Agents",
    members: "Members",
    branding: "Branding",
    brandingNote:
      "Instance-wide. Branding applies to everyone on this deployment, so it has no scope to select.",
    noAuthority:
      "You don't have administrative authority over any scope. Ask a tenant or subscription manager if you think this is a mistake.",
    scopes: "Scopes",
    subscriptions: "Subscriptions",
    resizeScopes: "Resize scopes",
    sectionsAria: "Sections of this agent",
    backToAgents: "Back to agents",
    tabs: {
      files: "Files",
      secrets: "Secrets",
      skills: "Skills",
      model: "Models",
      members: "Members",
    },
    // "The inventory is proxy-wide. Only the defaults and pins below it belong
    // to <scope> and <agent>." Shown on the model tab, where the scope line
    // would otherwise overstate what a scope owns.
    inventoryProxyWideBefore: "The inventory is ",
    inventoryProxyWide: "proxy-wide",
    inventoryProxyWideAfter: ". Only the defaults and pins below it belong to ",
    inventoryAnd: " and ",
    // "Reaches <scope> and every subscription under it, through <agent> only."
    // The all-agents branch is gone with the all-agents action: there is no longer
    // any way to write to a store belonging to no agent in particular.
    reaches: "Reaches",
    andEverySubscription: " and every subscription under it",
    throughBefore: ", through ",
    throughAfter: " only.",
    period: ".",
  },
  agentGate: {
    heading: "Choose an agent",
    note: "Agents exist before any tenant or subscription does — they come from this deployment's proxy configuration. Pick one, then choose the tenant or subscription to configure it for.",
    none: "The proxy reported no agents. Check its configuration, or ask whoever administers this deployment.",
  },
  legacyStore: {
    groupLabel: "Legacy",
    entryLabel: "Shared by all agents",
    entryNote: "Read-only. Written before content was scoped per agent.",
    readOnlyNote:
      "This store belongs to no agent. Nothing writes to it any more; what is here can be read and removed, and every container under the scope still reads it.",
  },
  scope: {
    label: "Scope",
    noSubscriptions: "No subscriptions yet.",
    collapseTenant: "Collapse tenant",
    expandTenant: "Expand tenant",
    tenantPrefix: "Tenant",
    subscriptionPrefix: "Subscription",
  },
  models: {
    // The accordion shell around the inventory. Separate from active/inactive:
    // those label a model's state, these label the sections that hold them.
    readingInventory: "Reading the inventory…",
    inventoryEmpty: "Empty — nothing can be served until a model is registered",
    inventorySummary: "{active} in service · {inactive} retired or held back",
    inventoryHint:
      "One inventory for the whole proxy. A model is registered here once, and every scope below points at this record instead of holding its own copy of the credentials.",
    inService: "In service",
    deprecate: "Deprecate",
    retiredOrHeld: "Retired or held back",
    noAgents: "No agents reported by the gateway, so the inventory cannot be reached.",
    startFrom: "Start from a known model",
    startFromJob: "Fills the provider fields below. Choose the last option to type them yourself.",
    custom: "Something else — fill it in by hand",
    yourName: "What you call it here",
    yourNameJob: "Your name for it, used everywhere in this screen. Must be unique.",
    providerName: "What the provider calls it",
    providerNameJob: "The exact id the provider expects. It often differs from your name.",
    provider: "Provider",
    providerJob: "Who serves the model. Picoclaw uses it to choose how to talk to them.",
    apiBase: "Where to send requests",
    apiBaseJob: "The provider's API address. Leave empty to use their default.",
    authMethod: "Sign-in method",
    authMethodJob: "Only for providers that use OAuth instead of a key. Leave empty otherwise.",
    apiKey: "API key",
    apiKeyJob: "Write-only. Stored once here and reused by every scope that points at this model.",
    saving: "Saving…",
    saveChanges: "Save changes",
    addModel: "Add model",
    noneActive: "No active models. Register one to get started.",
    noneInactive: "Nothing disabled or deprecated.",
    noFallbacks: "No fallbacks. Requests that fail have nowhere to go.",
    inventory: "Model inventory",
    register: "Register model",
    catalogPlaceholder: "pick one to prefill…",
    writtenAs: "Written to each workspace as",
    keyGoesToBefore: "The key goes to ",
    keyGoesToMiddle: " instead — never to ",
    keyGoesToAfter: ".",
    leaveBlankBefore: "Leave it blank to ",
    leaveBlankBold: "keep the key already stored",
    leaveBlankAfter:
      ". This screen never shows a key back, so it cannot be re-typed from what you see.",
    readingOrderBefore: "This order is for reading only. A model's fallback chain is the ",
    readingOrderAfter: " list on the model itself.",
    retirePrefix: "Retire",
    retireExplain: "Everyone already using it keeps it. New users get the replacement instead.",
    replacementPlaceholder: "replacement for new users…",
    chainFor: "Fallback chain for",
    chainExplainBefore: "This ordered list — not the inventory listing order — becomes ",
    chainExplainMiddle: ". Every model here also gets its key written into each workspace that uses ",
    chainExplainAfter: ".",
    noOtherActive: "no other active models",
    addFallback: "add a fallback…",
    saveChain: "Save chain",
    active: "Active",
    inactive: "Inactive",
  },
  modelRow: {
    keyStored: "key stored",
    heldBack: "held back",
    retiringTo: "retiring →",
    imported: "imported",
    fallsBackTo: "falls back to",
    noFallbacks: "No fallbacks — a failed request has nowhere to go",
    // "in use by 3 references"
    inUseOne: "in use by 1 reference",
    inUseOther: "in use by {n} references",
    disable: "Disable",
    enable: "Enable",
    movePrefix: "Move",
    moveUpSuffix: "up",
    moveDownSuffix: "down",
    editPrefix: "Edit",
    edit: "Edit",
    duplicatePrefix: "Duplicate",
    duplicate: "Duplicate",
    fallbackChainPrefix: "Edit fallback chain for",
    fallbackChain: "Fallback chain",
    retirePrefix: "Retire",
    retireTitle: "Retire — people already on it keep it, new ones get the replacement",
    deletePrefix: "Delete",
    cannotDisable: "Cannot disable while {reason} — retire it instead",
    cannotDelete: "Cannot delete while {reason}",
  },
  defaults: {
    // The accordion form of the section. `title` above is the older flat
    // heading; this one names the scope, because the rail on the left is easy
    // to lose track of once the page scrolls.
    titleScoped: "Which model people get in {scope}",
    thisScope: "this scope",
    readingLevels: "Reading every level…",
    summaryFrom: " — from ",
    nothingReadable: "Nothing you can read resolves — an instance-wide level may still cover it",
    nothingResolves: "Nothing resolves yet, so new workspaces here are refused",
    hintLoading:
      "Read the ladder downwards: each level covers fewer people than the one above and overrides it.",
    // "Most specific wins: <model> decides because <level> is the first level…"
    hintInEffectBefore: "Read downwards — the narrowest level with a model wins, so ",
    hintInEffectMiddle: " decides, from ",
    hintInEffectAfter:
      ". Select any rung to edit that level: the one whose reach matches who you want to move, or the pin rung at the bottom for a single person.",
    hintHidden:
      "None of the levels you can read names a model. An instance-wide level may still cover this scope — reading those needs instance-admin. Set the level for this scope if you need to be certain what new workspaces land on.",
    hintNoneBold: "Nothing resolves here yet, so a new workspace under this scope is refused.",
    hintNoneAfter:
      " Select a rung and choose a model: the instance-wide rungs at the top to cover whatever nothing else claims, the tenant rung for everyone in the tenant, the subscription rung for one team.",
    selectOnLeft: "Select a {level} on the left to set its default.",
    modelFor: "Model for {target}",
    pinsTitle: "People with a model of their own",
    pin: "Pin",
    unpin: "Unpin",
    pinsSome: "{pinned} of {total} pinned, so the levels above do not reach them",
    pinsHint:
      "A pin outranks every level above. Use it for one person who needs something different, not to move a whole group — that is what a scope default is for.",
    title: "Which model this scope resolves to",
    selectSubscription: "Select a subscription to pin models to its users.",
    clearingMovesBefore: "Clearing the level in effect would move its workspaces to ",
    // Split around the bold: "…would leave new workspaces with NO RESOLVABLE
    // MODEL, which refuses to provision."
    clearLeavesHiddenBefore:
      "Nothing you can read is set above this, and the instance-wide levels are hidden from you — clearing it may leave new workspaces with ",
    clearLeavesBefore:
      "Nothing is set above this. Clearing it would leave new workspaces with ",
    noResolvableModel: "no resolvable model",
    clearLeavesAfter: ", which refuses to provision.",
    onNextStart: " on their next start.",
    nothingSetHere: "nothing set at this level",
    retiredCurrent: "{name} (retired — current default)",
    clear: "Clear",
    perUserPins: "Per-user pins",
    noUsersYet:
      "No users have a workspace under this subscription yet (they must start a chat first).",
    pinnedTo: "pinned · {model}",
    inheritedTo: "inherited · {model}",
    notMaterialized: "not materialized yet",
    inheritedFromScope: "inherited from scope",
    intro:
      "Most specific wins. Pick a level to change what new workspaces land on; the levels below stay set and take over if you clear it.",
    setLevel: "Set the {level} level",
    instanceJob:
      "Instance-wide. Needs instance-admin, and reaches each workspace on its next start rather than restarting the fleet.",
    scopeJob:
      "New workspaces at this level land on this model unless a more specific level or a per-user pin overrides it.",
    clearWarnBefore: "Nothing is set below this. Clearing it would leave new workspaces with ",
    clearWarnBold: "no resolvable model",
    clearWarnAfter: ", which refuses to provision.",
  },
  invite: {
    title: "Invite someone",
    emailPlaceholder: "person@example.com",
    agentAria: "Agent",
    accessAria: "Access",
    read: "read",
    write: "write",
    waitingEmail: "Waiting for a valid email address…",
    // "{agent}" is the agent identifier, which is never translated.
    noRole:
      "This deployment declares no guest role for {agent}, so it cannot be granted here.",
    submit: "Send invitation",
    submitting: "Inviting…",
    invited: "Invited {email} to {agent} ({level}).",
    alreadyInvited: "{email} already had this access.",
    failed: "Could not send the invitation.",
  },
  roster: {
    notYetActive: "not yet active",
    noneYet: "Nobody has access to this subscription yet. Invite someone above.",
    revokeAria: "Revoke {role} from {email}",
    revokeTitle: "Revoke access?",
    // Says what revoking does NOT do: the same panel deletes files, so an admin
    // could reasonably assume this does both.
    revokeMessage:
      "{email} will lose {level} access to {agent}. Their workspace and files are kept — deleting those is a separate action.",
    revoke: "Revoke",
    revokeFailed: "Could not revoke access.",
  },
  restartPolicy: {
    heading: "When changes take effect",
    // Answers to the heading, not commands. They used to read "Restart now" /
    // "Notify members" / "Schedule for…", which look like buttons that do
    // something the moment they are clicked — and an admin reported clicking
    // "Restart now" and watching nothing restart. Nothing was broken: the choice
    // only rides along with the NEXT save. The labels now complete the sentence
    // the heading starts.
    now: "Immediately",
    notice: "When each member chooses",
    schedule: "At a time I pick",
    nowHint: "Applies immediately. Anyone mid-conversation is briefly interrupted.",
    noticeHint: "Applies on disk now; each member restarts when it suits them.",
    scheduleHint:
      "Applies on disk now; every running instance restarts at the time you pick.",
    // The collapsed section: title plus the policy in force, so a non-default
    // choice is never hidden behind a closed header.
    advancedTitle: "Advanced — when changes take effect",
    summaryNow: "Immediately, interrupting anyone mid-conversation",
    summaryNotice: "Written now; each member restarts when it suits them",
    summarySchedule: "Written now; every instance restarts at {at}",
    summaryScheduleUnset: "Written now; pick the time before making changes",
    groupAria: "When changes take effect",

    // --- the pending notice, and acting on the scope without saving a change
    //     (FR-8.3). The verb follows the mode chosen above, so the section never
    //     carries two competing notions of delivery.
    // The negative claim is where the scoping caveat belongs: the proxy reads ONE
    // slot (this scope + this agent), never the cascade, so "nothing pending" is
    // only ever true about the slot named right here.
    pendingNone: "Nothing armed for {scope} · {agent}. Another scope or agent may still have one.",
    everyAgentSlot: "every agent",
    pendingReading: "Checking this scope…",
    pendingSince: "Raised {at}",
    pendingScheduled: "Restarting at {at}",
    pendingBy: "by {who}",
    // The reason enum, phrased as what happened rather than as a mechanism.
    reasons: {
      "shared-secret": "a shared credential changed",
      "shared-skills": "shared skills changed",
      "shared-files": "shared files changed",
      model: "the model changed",
      "own-secret": "a member changed their own credential",
      "admin-request": "an administrator asked for it",
      config: "an administrator repaired this instance's configuration",
    },
    // A build older than the proxy may meet a reason it has not learned.
    reasonUnknown: "a recent change",
    actNow: "Restart now",
    actNotice: "Notify members now",
    actSchedule: "Schedule the restart",
    withdraw: "Withdraw",
    // Replaces "nothing restarts until you save" once a verb sits right there.
    ridesAlong: "This choice rides along with the changes you save below. To act on the scope right now, use the button.",
    confirmTitle: "This interrupts people who are working right now",
    // What the proxy actually does: BounceScope stops and starts every RUNNING
    // container under the scope. So the reach is "whoever has a live session",
    // not "everyone", and the loss is the reply in flight — worth stating
    // precisely, because a vague warning gets clicked through.
    confirmMessage:
      "Every instance running under {scope} stops and starts again. Members with no session open notice nothing.",
    confirmMessageAgent:
      "Every instance running under {scope}, through {agent} only, stops and starts again. Members with no session open notice nothing.",
    confirmDetail:
      "Anyone with a reply in progress loses it and has to ask again. There is no undo — to give members warning instead, close this and choose “When each member chooses”.",
    confirmLabel: "Restart now",
    doneRestarted: "Restarted.",
    doneArmed: "Members have been notified.",
    doneScheduled: "Scheduled.",
    doneWithdrawn: "Withdrawn.",
    atLabel: "Restart at (your local time)",
    atInvalid: "Pick a time in the future (within 7 days).",
    noteLabel: "Note to members (optional)",
    notePlaceholder: "e.g. rotating the search provider key",
    blocked: "Finish the schedule above before making changes here.",
  },
  members: {
    selectSubscription: "Select a subscription to see its members.",
    none: "No members under this subscription yet.",
    privacyNote:
      "You can list and delete a member's private files, but never open or edit their contents — a member's private content never leaves their workspace (FR-7).",
    noPrivateFiles: "No private files.",
    deletePrefix: "Delete",
    deleteTitle: "Delete member's file?",
    deleteMessage:
      "“{name}” will be permanently removed from this member's private workspace.",
    // The Instances section: one row per agent this member has a workspace under.
    instancesHeading: "Instances",
    instancesNote:
      "One instance per agent this member has started. Editing its configuration is not the same as opening their files — see below.",
    editConfig: "Edit configuration",
    noInstances: "No instances yet.",
  },
  branding: {
    lightLogo: "Light logo",
    darkLogo: "Dark logo",
    appIcon: "App icon (square)",
    previewSuffix: "preview",
    logoUpdated: "{label} updated.",
    logoReset: "{label} reset to default.",
    logosHeading: "Logos",
    logosIntro:
      "PNG, JPEG, WebP or SVG, up to ~1MB. Served as-is — there is no server-side image processing, so each image has to arrive in the shape it will be shown in.",
    iconNoteBefore: "The ",
    iconNoteAppIcon: "app icon",
    iconNoteMiddle: " is what an installed PWA and the browser tab use, so it must be a ",
    iconNoteSquare: "square PNG or WebP, 512×512",
    iconNoteAfter:
      ". Keep the artwork inside the middle ~80% — Android crops icons to a circle. A wide logo here is what stops the app from being installable, which is why it is a separate upload from the wordmark logos.",
    appNameHeading: "App name",
    appNameIntro:
      "Shown across the UI, the document title and the PWA. Leave empty to fall back to the default.",
    nameSaved: "App name saved.",
    nameReset: "App name reset to default.",
    working: "Working…",
    upload: "Upload",
    resetPrefix: "Reset",
    resetSuffix: "to default",
    resetToDefault: "Reset to default",
    resetNameTitle: "Reset app name?",
    resetNameMessage: "The app name will fall back to the default (zombie-crab) everywhere.",
    resetLogoTitle: "Reset logo?",
    resetLogoMessage: "This image will fall back to the bundled default.",
    noBrandingPermission: "You don't have permission to edit branding.",
  },
  sharedFiles: {
    uploading: "Uploading…",
    upload: "Upload file",
    cascades: "Cascades read-only to every container below this scope.",
    none: "No shared files at this scope yet.",
    downloadPrefix: "Download",
    deletePrefix: "Delete",
    deleteTitle: "Delete shared file?",
    deleteMessage:
      "“{name}” will be removed for everyone below this scope. Containers restart to pick up the change.",
  },
  sharedSecrets: {
    invalidName: "Name may only contain letters, numbers, and . _ -",
    formatNative: "native (picoclaw search-provider / model key)",
    slotWeb: "A web search provider's key",
    slotModel: "A model's API key",
    noRegisteredModels:
      "{agent} has no registered models yet — register one in the Model tab first.",
    injectedAs:
      "Injected as environment into every container below this scope, merged under each user's own secrets.",
    selectModel: "Select a model.",
    valueRequired: "Enter a value.",
    howReceived: "How the agent receives it",
    howReceivedJob:
      "Environment variable, a JSON entry, a file on disk, or a slot in picoclaw's own config.",
    whichSetting: "Which picoclaw setting",
    whichSettingJob:
      "The two config slots a scope admin may write. Everything else in picoclaw's config is off limits.",
    whichSearch: "Which search provider",
    whichSearchJob: "Picoclaw's web tool uses whichever provider has a key.",
    whichSearchConsequence:
      "Written into every workspace below this scope, on their next start.",
    pickAgentFirst: "Pick a single agent above to set a model API key.",
    whichModel: "Which model",
    whichModelJob: "Only models registered for {agent}. A name typed by hand would be rejected.",
    modelConsequenceBefore: "A key here ",
    modelConsequenceBold: "overrides the one stored on the model itself",
    modelConsequenceAfter:
      ", for this scope only. Workspaces below this scope that resolve to a different model are skipped.",
    selectModelOption: "Select a model…",
    nameLabel: "Name the agent will read it by",
    nameJob: "Exactly as the agent's code expects it — case and underscores included.",
    valueLabel: "Value",
    valueJob: "Write-only. It is never shown or retrieved after you save it.",
    valueConsequence:
      "Saving restarts the running containers under this scope so they pick it up.",
    valuePlaceholder: "paste the value",
    saving: "Saving…",
    save: "Save shared secret",
    setSecrets: "Set secrets",
    none: "No shared secrets at this scope yet.",
    deletePrefix: "Delete",
    deleteTitle: "Delete shared secret?",
    deleteMessage:
      "“{name}” will be removed. Containers below this scope restart to drop it.",
  },
  sharedSkills: {
    newSkill: "New skill",
    uploading: "Uploading…",
    uploadZip: "Upload .zip",
    cascades:
      "Cascades read-only to every container below this scope. Adding, replacing, or removing a skill restarts affected containers.",
    namePlaceholder: "skill-name",
    closeEditor: "Close editor",
    bodyPlaceholder: "SKILL.md contents",
    saving: "Saving…",
    none: "No shared skills at this scope yet.",
    files: "files",
    previewPrefix: "Preview",
    downloadPrefix: "Download",
    deletePrefix: "Delete",
    deleteTitle: "Delete shared skill?",
    deleteMessage:
      "“{name}” will be removed for everyone below this scope. Containers restart to pick up the change.",
  },
  // Passed into buildLadder so that pure helper stops emitting English UI text.
  ladderRungs: {
    pinned: "Pinned to one person",
    pinnedDetail: "{n} pinned — a pin outranks every level above",
    nobodyPinned: "Nobody here is pinned",
    subscription: "This subscription",
    subscriptionNamed: "This subscription — {name}",
    tenant: "Tenant",
    tenantNamed: "Tenant — {name}",
    agentNamed: "Agent — {name}",
    agentDetail: "every tenant, {name} only",
    thisAgent: "this agent",
    everythingElse: "Everything else",
    instanceWide: "instance-wide",
    selectSubscriptionForPins: "Select a subscription to see who is pinned",
    selectSubscription: "Select a subscription in the tree to see or set this",
    selectTenant: "Select a tenant in the tree to see or set this",
    selectAgent: "Select an agent above to see or set this",
  },
  ladder: {
    editing: "editing",
    unreadable: "Instance-wide levels need instance-admin privileges",
    nothingSet: "Nothing set at this level",
    inEffect: "in effect",
    overridden: "overridden",
    notSet: "not set",
    locked: "not yours to see",
    outOfScope: "out of scope",
    // The two end caps. Read as one sentence, top to bottom, they teach the
    // direction the ladder is meant to be read in — the one thing the rungs
    // themselves cannot say.
    readDown: "Read down. Each level narrows who it covers and overrides the ones above it.",
    winnerNote: "The last level with a model is the one a person ends up with.",
  },
  // The instance-config editor. A repair surface, so the copy leans on saying
  // what is and is not the admin's to change, and what a save does not do on its
  // own (config.json is read only when the instance boots).
  instanceConfig: {
    heading: "Instance configuration",
    close: "Close",
    rawMode: "Raw JSON",
    treeMode: "Tree",
    format: "Reformat",
    validJson: "Valid JSON",
    invalidJson: "The document has to be a JSON object.",
    atLine: "(line {line}, column {column})",
    expand: "Expand",
    collapse: "Collapse",
    lineLabel: "line",
    collapseAll: "Collapse all",
    expandAll: "Expand all",
    foldTitle: "{count} entries",
    typeLabel: "Type of",
    addKey: "Add key",
    newKeyPlaceholder: "new_key",
    duplicateKey: "That key already exists here.",
    removeKey: "Remove",
    appendItem: "Add item",
    managedAria: "Managed by the proxy",
    managedNote:
      "Locked keys belong to the proxy — it rewrites them whenever it applies a model, so an edit to one of them will not stick. Change the model from the Models tab instead.",
    redactedNote:
      "A credential was found in this file, left there by an older layout. Its value is masked and is not shown here; the proxy replaces the whole model list when you save.",
    save: "Save",
    saveAndRestart: "Save and restart now",
    saveAndNotify: "Save and notify the member",
    restartNow: "Restart this instance",
    restarting: "Restarting…",
    restarted: "Instance restarted. It is running the configuration above.",
    restartNoop:
      "Nothing was running to restart — this instance is stopped, and it will read the configuration above the next time the member opens it.",
    restartHint:
      "picoclaw reads config.json only when the instance starts, so a save alone changes nothing yet. If the instance is broken it may not be running at all, and its member cannot restart it themselves — use the button.",
    saving: "Saving…",
    saved: "Configuration saved.",
    managedReverted:
      "Saved. The proxy re-established the keys it owns, so these went back to its own values: {paths}",
    reapplyFailed:
      "Saved, but the proxy could not re-apply this instance's model afterwards. The file is on disk; fix the model assignment and it will settle on the next apply.",
    staleRevision:
      "This configuration changed while you were editing, so nothing was written. Reload to see the current file before saving again.",
    reload: "Reload",
    notProvisioned:
      "This member has never started this agent, so there is no configuration to repair yet.",
    discardTitle: "Discard your changes?",
    discardMessage: "The edits in this editor have not been saved and cannot be recovered.",
    discard: "Discard",
  },
};

export type AdminDict = typeof en;

const pt: AdminDict = {
  shell: {
    heading: "Administração",
    backToChat: "Voltar ao chat",
    noSubscriptionsManaged:
      "Você não administra nenhuma assinatura diretamente, então não há workspaces de membros para listar aqui.",
    selectScope: "Selecione um escopo à esquerda para administrá-lo.",

    areaAria: "Área administrativa",
    agents: "Agentes",
    members: "Membros",
    branding: "Marca",
    brandingNote:
      "Vale para toda a instância. A marca se aplica a todos neste deployment, então não há escopo a selecionar.",
    noAuthority:
      "Você não tem autoridade administrativa sobre nenhum escopo. Fale com um gestor de tenant ou de assinatura se achar que isso é um engano.",
    scopes: "Escopos",
    subscriptions: "Assinaturas",
    resizeScopes: "Redimensionar escopos",
    sectionsAria: "Seções deste agente",
    backToAgents: "Voltar aos agentes",
    tabs: {
      files: "Arquivos",
      secrets: "Segredos",
      skills: "Skills",
      model: "Modelos",
      members: "Membros",
    },
    inventoryProxyWideBefore: "O inventário é ",
    inventoryProxyWide: "global do proxy",
    inventoryProxyWideAfter: ". Apenas os padrões e pins abaixo dele pertencem a ",
    inventoryAnd: " e ",
    reaches: "Alcança",
    andEverySubscription: " e todas as assinaturas sob ele",
    throughBefore: ", através de ",
    throughAfter: " apenas.",
    period: ".",
  },
  agentGate: {
    heading: "Escolha um agente",
    note: "Agentes existem antes de qualquer tenant ou assinatura — eles vêm da configuração do proxy deste deployment. Escolha um e depois selecione o tenant ou a assinatura para configurá-lo.",
    none: "O proxy não reportou nenhum agente. Verifique a configuração dele, ou fale com quem administra este deployment.",
  },
  legacyStore: {
    groupLabel: "Legado",
    entryLabel: "Compartilhado por todos os agentes",
    entryNote: "Somente leitura. Gravado antes do conteúdo passar a ter escopo por agente.",
    readOnlyNote:
      "Este store não pertence a nenhum agente. Nada mais grava nele; o que está aqui pode ser lido e removido, e todos os contêineres sob o escopo continuam lendo.",
  },
  scope: {
    label: "Escopo",
    noSubscriptions: "Nenhuma assinatura ainda.",
    collapseTenant: "Recolher tenant",
    expandTenant: "Expandir tenant",
    tenantPrefix: "Tenant",
    subscriptionPrefix: "Assinatura",
  },
  models: {
    readingInventory: "Lendo o inventário…",
    inventoryEmpty: "Vazio — nada pode ser servido até que um modelo seja registrado",
    inventorySummary: "{active} em serviço · {inactive} aposentados ou retidos",
    inventoryHint:
      "Um inventário para todo o proxy. Um modelo é registrado aqui uma vez, e cada escopo abaixo aponta para este registro em vez de guardar a própria cópia das credenciais.",
    inService: "Em serviço",
    deprecate: "Descontinuar",
    retiredOrHeld: "Aposentados ou retidos",
    noAgents: "O gateway não reportou nenhum agente, então o inventário não pode ser acessado.",
    startFrom: "Começar de um modelo conhecido",
    startFromJob: "Preenche os campos do provedor abaixo. Escolha a última opção para digitá-los você mesmo.",
    custom: "Outra coisa — preencher à mão",
    yourName: "Como você chama aqui",
    yourNameJob: "O seu nome para ele, usado em toda esta tela. Precisa ser único.",
    providerName: "Como o provedor chama",
    providerNameJob: "O id exato que o provedor espera. Costuma ser diferente do seu nome.",
    provider: "Provedor",
    providerJob: "Quem serve o modelo. O picoclaw usa isso para saber como falar com ele.",
    apiBase: "Para onde enviar as requisições",
    apiBaseJob: "O endereço da API do provedor. Deixe vazio para usar o padrão dele.",
    authMethod: "Método de autenticação",
    authMethodJob: "Só para provedores que usam OAuth em vez de chave. Caso contrário, deixe vazio.",
    apiKey: "Chave de API",
    apiKeyJob: "Somente escrita. Guardada uma vez aqui e reutilizada por todo escopo que aponte para este modelo.",
    saving: "Salvando…",
    saveChanges: "Salvar alterações",
    addModel: "Adicionar modelo",
    noneActive: "Nenhum modelo ativo. Registre um para começar.",
    noneInactive: "Nada desativado ou aposentado.",
    noFallbacks: "Sem fallbacks. Requisições que falham não têm para onde ir.",
    inventory: "Inventário de modelos",
    register: "Registrar modelo",
    catalogPlaceholder: "escolha um para preencher…",
    writtenAs: "Escrito em cada workspace como",
    keyGoesToBefore: "A chave vai para ",
    keyGoesToMiddle: " em vez disso — nunca para ",
    keyGoesToAfter: ".",
    leaveBlankBefore: "Deixe em branco para ",
    leaveBlankBold: "manter a chave já guardada",
    leaveBlankAfter:
      ". Esta tela nunca exibe a chave de volta, então ela não pode ser redigitada a partir do que você vê.",
    readingOrderBefore: "Esta ordem é só para leitura. A cadeia de fallback de um modelo é a lista ",
    readingOrderAfter: " no próprio modelo.",
    retirePrefix: "Aposentar",
    retireExplain: "Quem já usa continua com ele. Novos usuários recebem o substituto.",
    replacementPlaceholder: "substituto para novos usuários…",
    chainFor: "Cadeia de fallback de",
    chainExplainBefore: "Esta lista ordenada — não a ordem de listagem do inventário — vira ",
    chainExplainMiddle: ". Todo modelo aqui também tem sua chave escrita em cada workspace que usa ",
    chainExplainAfter: ".",
    noOtherActive: "nenhum outro modelo ativo",
    addFallback: "adicionar um fallback…",
    saveChain: "Salvar cadeia",
    active: "Ativos",
    inactive: "Inativos",
  },
  modelRow: {
    keyStored: "chave guardada",
    heldBack: "retido",
    retiringTo: "aposentando →",
    imported: "importado",
    fallsBackTo: "recorre a",
    noFallbacks: "Sem fallbacks — uma requisição que falha não tem para onde ir",
    inUseOne: "em uso por 1 referência",
    inUseOther: "em uso por {n} referências",
    disable: "Desativar",
    enable: "Ativar",
    movePrefix: "Mover",
    moveUpSuffix: "para cima",
    moveDownSuffix: "para baixo",
    editPrefix: "Editar",
    edit: "Editar",
    duplicatePrefix: "Duplicar",
    duplicate: "Duplicar",
    fallbackChainPrefix: "Editar a cadeia de fallback de",
    fallbackChain: "Cadeia de fallback",
    retirePrefix: "Aposentar",
    retireTitle: "Aposentar — quem já usa continua; novos recebem o substituto",
    deletePrefix: "Excluir",
    cannotDisable: "Não dá para desativar enquanto {reason} — aposente-o em vez disso",
    cannotDelete: "Não dá para excluir enquanto {reason}",
  },
  defaults: {
    titleScoped: "Qual modelo as pessoas recebem em {scope}",
    thisScope: "este escopo",
    readingLevels: "Lendo todos os níveis…",
    summaryFrom: " — de ",
    nothingReadable: "Nada que você pode ler resolve — um nível de instância ainda pode cobrir",
    nothingResolves: "Nada resolve ainda, então novos workspaces aqui são recusados",
    hintLoading:
      "Leia a escada de cima para baixo: cada nível cobre menos gente que o de cima e o sobrepõe.",
    hintInEffectBefore: "Leia de cima para baixo — vence o nível mais específico com um modelo, então ",
    hintInEffectMiddle: " decide, vindo de ",
    hintInEffectAfter:
      ". Selecione qualquer degrau para editar aquele nível: o que corresponde a quem você quer mover, ou o degrau de pin no fim para uma única pessoa.",
    hintHidden:
      "Nenhum dos níveis que você pode ler nomeia um modelo. Um nível de instância ainda pode cobrir este escopo — lê-los exige admin da instância. Defina o nível deste escopo se precisar ter certeza de onde novos workspaces caem.",
    hintNoneBold: "Nada resolve aqui ainda, então um novo workspace neste escopo é recusado.",
    hintNoneAfter:
      " Selecione um degrau e escolha um modelo: os degraus de instância no topo para cobrir o que mais nada reivindicar, o de tenant para todo o tenant, o de assinatura para um time.",
    selectOnLeft: "Selecione um {level} à esquerda para definir o padrão dele.",
    modelFor: "Modelo para {target}",
    pinsTitle: "Pessoas com um modelo próprio",
    pin: "Fixar",
    unpin: "Desafixar",
    pinsSome: "{pinned} de {total} com pin, então os níveis acima não os alcançam",
    pinsHint:
      "Um pin supera todos os níveis acima. Use para uma pessoa que precisa de algo diferente, não para mover um grupo inteiro — para isso existe o padrão de escopo.",
    title: "Para qual modelo este escopo resolve",
    selectSubscription: "Selecione uma assinatura para fixar modelos aos seus usuários.",
    clearingMovesBefore: "Limpar o nível em vigor moveria os workspaces dele para ",
    clearLeavesHiddenBefore:
      "Nada que você possa ler está definido acima deste, e os níveis de instância estão ocultos para você — limpar pode deixar novos workspaces sem ",
    clearLeavesBefore:
      "Nada está definido acima deste. Limpar deixaria novos workspaces sem ",
    noResolvableModel: "nenhum modelo resolvível",
    clearLeavesAfter: ", o que recusa o provisionamento.",
    onNextStart: " na próxima inicialização.",
    nothingSetHere: "nada definido neste nível",
    retiredCurrent: "{name} (aposentado — padrão atual)",
    clear: "Limpar",
    perUserPins: "Pins por usuário",
    noUsersYet:
      "Nenhum usuário tem workspace nesta assinatura ainda (é preciso iniciar uma conversa primeiro).",
    pinnedTo: "fixado · {model}",
    inheritedTo: "herdado · {model}",
    notMaterialized: "ainda não materializado",
    inheritedFromScope: "herdado do escopo",
    intro:
      "O mais específico vence. Escolha um nível para mudar onde novos workspaces caem; os níveis abaixo continuam definidos e assumem se você limpar este.",
    setLevel: "Definir o nível {level}",
    instanceJob:
      "Vale para toda a instância. Exige admin da instância e alcança cada workspace na próxima inicialização, sem reiniciar a frota.",
    scopeJob:
      "Novos workspaces neste nível caem neste modelo, a menos que um nível mais específico ou um pin por usuário sobreponha.",
    clearWarnBefore: "Nada está definido abaixo disto. Limpar deixaria novos workspaces ",
    clearWarnBold: "sem modelo resolvível",
    clearWarnAfter: ", o que impede o provisionamento.",
  },
  invite: {
    title: "Convidar alguém",
    emailPlaceholder: "pessoa@exemplo.com",
    agentAria: "Agente",
    accessAria: "Acesso",
    read: "leitura",
    write: "escrita",
    waitingEmail: "Aguardando um endereço de e-mail válido…",
    noRole:
      "Esta instalação não declara nenhum guest role para {agent}, então ele não pode ser concedido aqui.",
    submit: "Enviar convite",
    submitting: "Convidando…",
    invited: "{email} convidado para {agent} ({level}).",
    alreadyInvited: "{email} já tinha este acesso.",
    failed: "Não foi possível enviar o convite.",
  },
  roster: {
    notYetActive: "ainda não ativo",
    noneYet: "Ninguém tem acesso a esta assinatura ainda. Convide alguém acima.",
    revokeAria: "Revogar {role} de {email}",
    revokeTitle: "Revogar acesso?",
    revokeMessage:
      "{email} perderá o acesso de {level} a {agent}. O workspace e os arquivos são mantidos — excluí-los é uma ação separada.",
    revoke: "Revogar",
    revokeFailed: "Não foi possível revogar o acesso.",
  },
  restartPolicy: {
    heading: "Quando as alterações passam a valer",
    now: "Imediatamente",
    notice: "Quando cada membro quiser",
    schedule: "Em um horário que eu escolher",
    nowHint: "Aplica imediatamente. Quem estiver em conversa é interrompido por um instante.",
    noticeHint: "Aplica em disco agora; cada membro reinicia quando lhe convier.",
    scheduleHint:
      "Aplica em disco agora; toda instância em execução reinicia na hora escolhida.",
    advancedTitle: "Avançado — quando as alterações passam a valer",
    summaryNow: "Imediatamente, interrompendo quem estiver em conversa",
    summaryNotice: "Gravado agora; cada membro reinicia quando lhe convier",
    summarySchedule: "Gravado agora; toda instância reinicia em {at}",
    summaryScheduleUnset: "Gravado agora; escolha o horário antes de fazer alterações",
    groupAria: "Quando as alterações passam a valer",

    pendingNone: "Nada armado para {scope} · {agent}. Outro escopo ou agente ainda pode ter.",
    everyAgentSlot: "todos os agentes",
    pendingReading: "Consultando este escopo…",
    pendingSince: "Levantado em {at}",
    pendingScheduled: "Reinicia em {at}",
    pendingBy: "por {who}",
    reasons: {
      "shared-secret": "uma credencial compartilhada mudou",
      "shared-skills": "as skills compartilhadas mudaram",
      "shared-files": "os arquivos compartilhados mudaram",
      model: "o modelo mudou",
      "own-secret": "um membro alterou a própria credencial",
      "admin-request": "um administrador pediu",
      config: "um administrador consertou a configuração desta instância",
    },
    reasonUnknown: "uma alteração recente",
    actNow: "Reiniciar agora",
    actNotice: "Avisar os membros agora",
    actSchedule: "Agendar o reinício",
    withdraw: "Retirar",
    ridesAlong: "Esta escolha acompanha as alterações que você salvar abaixo. Para agir sobre o escopo agora, use o botão.",
    confirmTitle: "Isto interrompe quem está trabalhando agora",
    confirmMessage:
      "Toda instância em execução sob {scope} para e sobe de novo. Quem não estiver com uma sessão aberta não percebe nada.",
    confirmMessageAgent:
      "Toda instância em execução sob {scope}, apenas por {agent}, para e sobe de novo. Quem não estiver com uma sessão aberta não percebe nada.",
    confirmDetail:
      "Quem estiver com uma resposta em andamento a perde e precisa perguntar de novo. Não há como desfazer — para avisar os membros em vez disso, feche e escolha “Quando cada membro quiser”.",
    confirmLabel: "Reiniciar agora",
    doneRestarted: "Reiniciado.",
    doneArmed: "Os membros foram avisados.",
    doneScheduled: "Agendado.",
    doneWithdrawn: "Retirado.",
    atLabel: "Reiniciar em (seu horário local)",
    atInvalid: "Escolha um horário no futuro (dentro de 7 dias).",
    noteLabel: "Recado aos membros (opcional)",
    notePlaceholder: "ex.: rotação da chave do provedor de busca",
    blocked: "Conclua o agendamento acima antes de fazer alterações aqui.",
  },
  members: {
    selectSubscription: "Selecione uma assinatura para ver seus membros.",
    none: "Nenhum membro nesta assinatura ainda.",
    privacyNote:
      "Você pode listar e excluir os arquivos privados de um membro, mas nunca abrir ou editar o conteúdo — o conteúdo privado de um membro nunca sai do workspace dele (FR-7).",
    noPrivateFiles: "Nenhum arquivo privado.",
    deletePrefix: "Excluir",
    deleteTitle: "Excluir o arquivo do membro?",
    deleteMessage:
      "“{name}” será removido permanentemente do workspace privado deste membro.",
    instancesHeading: "Instâncias",
    instancesNote:
      "Uma instância por agente que este membro já iniciou. Editar a configuração dela não é o mesmo que abrir os arquivos dele — veja abaixo.",
    editConfig: "Editar configuração",
    noInstances: "Nenhuma instância ainda.",
  },
  branding: {
    lightLogo: "Logo claro",
    darkLogo: "Logo escuro",
    appIcon: "Ícone do app (quadrado)",
    previewSuffix: "prévia",
    logoUpdated: "{label} atualizado.",
    logoReset: "{label} redefinido para o padrão.",
    logosHeading: "Logos",
    logosIntro:
      "PNG, JPEG, WebP ou SVG, até ~1MB. Servido como está — não há processamento de imagem no servidor, então cada imagem precisa chegar no formato em que será exibida.",
    iconNoteBefore: "O ",
    iconNoteAppIcon: "ícone do app",
    iconNoteMiddle: " é o que um PWA instalado e a aba do navegador usam, então precisa ser um ",
    iconNoteSquare: "PNG ou WebP quadrado, 512×512",
    iconNoteAfter:
      ". Mantenha a arte dentro dos ~80% centrais — o Android recorta ícones em círculo. Um logo largo aqui é o que impede a instalação do app, e é por isso que ele é um upload separado dos logos com marca-texto.",
    appNameHeading: "Nome do app",
    appNameIntro:
      "Aparece na interface, no título do documento e no PWA. Deixe vazio para voltar ao padrão.",
    nameSaved: "Nome do app salvo.",
    nameReset: "Nome do app redefinido para o padrão.",
    working: "Processando…",
    upload: "Enviar",
    resetPrefix: "Redefinir",
    resetSuffix: "para o padrão",
    resetToDefault: "Redefinir para o padrão",
    resetNameTitle: "Redefinir o nome do app?",
    resetNameMessage: "O nome do app volta ao padrão (zombie-crab) em todos os lugares.",
    resetLogoTitle: "Redefinir o logo?",
    resetLogoMessage: "Esta imagem volta ao padrão embutido.",
    noBrandingPermission: "Você não tem permissão para editar a marca.",
  },
  sharedFiles: {
    uploading: "Enviando…",
    upload: "Enviar arquivo",
    cascades: "Cascateia como somente leitura para todo container abaixo deste escopo.",
    none: "Nenhum arquivo compartilhado neste escopo ainda.",
    downloadPrefix: "Baixar",
    deletePrefix: "Excluir",
    deleteTitle: "Excluir arquivo compartilhado?",
    deleteMessage:
      "“{name}” será removido para todos abaixo deste escopo. Os containers reiniciam para aplicar a mudança.",
  },
  sharedSecrets: {
    invalidName: "O nome só pode conter letras, números e . _ -",
    formatNative: "native (chave de provedor de busca / modelo do picoclaw)",
    slotWeb: "A chave de um provedor de busca web",
    slotModel: "A chave de API de um modelo",
    noRegisteredModels:
      "{agent} ainda não tem modelos registrados — registre um na aba Modelos primeiro.",
    injectedAs:
      "Injetado como ambiente em todo container abaixo deste escopo, mesclado sob os segredos de cada usuário.",
    selectModel: "Selecione um modelo.",
    valueRequired: "Informe um valor.",
    howReceived: "Como o agente recebe",
    howReceivedJob:
      "Variável de ambiente, entrada JSON, arquivo em disco ou um slot na própria config do picoclaw.",
    whichSetting: "Qual configuração do picoclaw",
    whichSettingJob:
      "Os dois slots de config que um admin de escopo pode escrever. Todo o resto da config do picoclaw é intocável.",
    whichSearch: "Qual provedor de busca",
    whichSearchJob: "A ferramenta web do picoclaw usa o provedor que tiver uma chave.",
    whichSearchConsequence:
      "Escrito em todos os workspaces abaixo deste escopo, na próxima inicialização.",
    pickAgentFirst: "Escolha um único agente acima para definir uma chave de API de modelo.",
    whichModel: "Qual modelo",
    whichModelJob: "Apenas modelos registrados para {agent}. Um nome digitado à mão seria rejeitado.",
    modelConsequenceBefore: "Uma chave aqui ",
    modelConsequenceBold: "sobrepõe a que está guardada no próprio modelo",
    modelConsequenceAfter:
      ", apenas para este escopo. Workspaces abaixo deste escopo que resolvem para outro modelo são ignorados.",
    selectModelOption: "Selecione um modelo…",
    nameLabel: "Nome pelo qual o agente vai lê-lo",
    nameJob: "Exatamente como o código do agente espera — maiúsculas e sublinhados inclusos.",
    valueLabel: "Valor",
    valueJob: "Somente escrita. Nunca é exibido nem recuperado depois de salvo.",
    valueConsequence:
      "Salvar reinicia os containers em execução sob este escopo para que eles peguem o valor.",
    valuePlaceholder: "cole o valor",
    saving: "Salvando…",
    save: "Salvar segredo compartilhado",
    setSecrets: "Segredos definidos",
    none: "Nenhum segredo compartilhado neste escopo ainda.",
    deletePrefix: "Excluir",
    deleteTitle: "Excluir segredo compartilhado?",
    deleteMessage:
      "“{name}” será removido. Os containers abaixo deste escopo reiniciam para descartá-lo.",
  },
  sharedSkills: {
    newSkill: "Nova skill",
    uploading: "Enviando…",
    uploadZip: "Enviar .zip",
    cascades:
      "Cascateia como somente leitura para todo container abaixo deste escopo. Adicionar, substituir ou remover uma skill reinicia os containers afetados.",
    namePlaceholder: "nome-da-skill",
    closeEditor: "Fechar editor",
    bodyPlaceholder: "conteúdo do SKILL.md",
    saving: "Salvando…",
    none: "Nenhuma skill compartilhada neste escopo ainda.",
    files: "arquivos",
    previewPrefix: "Prévia de",
    downloadPrefix: "Baixar",
    deletePrefix: "Excluir",
    deleteTitle: "Excluir skill compartilhada?",
    deleteMessage:
      "“{name}” será removida para todos abaixo deste escopo. Os containers reiniciam para aplicar a mudança.",
  },
  ladderRungs: {
    pinned: "Fixado em uma pessoa",
    pinnedDetail: "{n} fixados — um pin supera todos os níveis acima",
    nobodyPinned: "Ninguém aqui está fixado",
    subscription: "Esta assinatura",
    subscriptionNamed: "Esta assinatura — {name}",
    tenant: "Tenant",
    tenantNamed: "Tenant — {name}",
    agentNamed: "Agente — {name}",
    agentDetail: "todos os tenants, apenas {name}",
    thisAgent: "este agente",
    everythingElse: "Todo o resto",
    instanceWide: "toda a instância",
    selectSubscriptionForPins: "Selecione uma assinatura para ver quem tem pin",
    selectSubscription: "Selecione uma assinatura na árvore para ver ou definir isto",
    selectTenant: "Selecione um tenant na árvore para ver ou definir isto",
    selectAgent: "Selecione um agente acima para ver ou definir isto",
  },
  ladder: {
    editing: "editando",
    unreadable: "Níveis de instância exigem privilégios de admin da instância",
    nothingSet: "Nada definido neste nível",
    inEffect: "em vigor",
    overridden: "sobreposto",
    notSet: "não definido",
    locked: "fora do seu alcance",
    outOfScope: "fora de escopo",
    readDown: "Leia de cima para baixo. Cada nível restringe quem ele cobre e sobrepõe os de cima.",
    winnerNote: "O último nível com um modelo é o que a pessoa recebe.",
  },
  instanceConfig: {
    heading: "Configuração da instância",
    close: "Fechar",
    rawMode: "JSON puro",
    treeMode: "Árvore",
    format: "Reformatar",
    validJson: "JSON válido",
    invalidJson: "O documento precisa ser um objeto JSON.",
    atLine: "(linha {line}, coluna {column})",
    expand: "Expandir",
    collapse: "Recolher",
    lineLabel: "linha",
    collapseAll: "Recolher tudo",
    expandAll: "Expandir tudo",
    foldTitle: "{count} entradas",
    typeLabel: "Tipo de",
    addKey: "Adicionar chave",
    newKeyPlaceholder: "nova_chave",
    duplicateKey: "Essa chave já existe aqui.",
    removeKey: "Remover",
    appendItem: "Adicionar item",
    managedAria: "Gerenciado pelo proxy",
    managedNote:
      "As chaves travadas pertencem ao proxy — ele as reescreve sempre que aplica um modelo, então uma edição nelas não vai permanecer. Troque o modelo pela aba Modelos.",
    redactedNote:
      "Foi encontrada uma credencial neste arquivo, deixada por um formato antigo. O valor está mascarado e não é exibido aqui; o proxy substitui a lista de modelos inteira quando você salvar.",
    save: "Salvar",
    saveAndRestart: "Salvar e reiniciar agora",
    saveAndNotify: "Salvar e avisar o membro",
    restartNow: "Reiniciar esta instância",
    restarting: "Reiniciando…",
    restarted: "Instância reiniciada. Ela está rodando a configuração acima.",
    restartNoop:
      "Não havia nada rodando para reiniciar — esta instância está parada, e vai ler a configuração acima na próxima vez que o membro abrir.",
    restartHint:
      "O picoclaw lê o config.json só quando a instância inicia, então salvar por si só ainda não muda nada. Se a instância está quebrada ela pode não estar rodando, e o membro não consegue reiniciá-la — use o botão.",
    saving: "Salvando…",
    saved: "Configuração salva.",
    managedReverted:
      "Salvo. O proxy restabeleceu as chaves que são dele, então estas voltaram aos valores dele: {paths}",
    reapplyFailed:
      "Salvo, mas o proxy não conseguiu reaplicar o modelo desta instância depois. O arquivo está no disco; corrija a atribuição de modelo e ela se ajusta na próxima aplicação.",
    staleRevision:
      "Esta configuração mudou enquanto você editava, então nada foi gravado. Recarregue para ver o arquivo atual antes de salvar de novo.",
    reload: "Recarregar",
    notProvisioned:
      "Este membro nunca iniciou este agente, então ainda não há configuração para consertar.",
    discardTitle: "Descartar suas alterações?",
    discardMessage: "As edições deste editor não foram salvas e não podem ser recuperadas.",
    discard: "Descartar",
  },
};

export const adminCopy: Record<Locale, AdminDict> = { en, pt };
