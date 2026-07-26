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
    areaAria: "Admin area",
    scopedActions: "Scoped actions",
    branding: "Branding",
    brandingNote:
      "Instance-wide. Branding applies to everyone on this deployment, so it has no scope to select.",
    noAuthority:
      "You don't have administrative authority over any scope. Ask a tenant or subscription manager if you think this is a mistake.",
    scopes: "Scopes",
    subscriptions: "Subscriptions",
    resizeScopes: "Resize scopes",
    sectionsAria: "Sections of this scope",
    tabs: {
      files: "Files",
      secrets: "Secrets",
      skills: "Skills",
      model: "Models",
      members: "Members",
    },
    // "Reaches <scope> and every subscription under it, through <agent> only."
    reaches: "Reaches",
    andEverySubscription: " and every subscription under it",
    throughBefore: ", through ",
    everyAgent: "every agent",
    throughAfter: " only.",
    period: ".",
  },
  scope: {
    label: "Scope",
    collapseTenant: "Collapse tenant",
    expandTenant: "Expand tenant",
    tenantPrefix: "Tenant",
    subscriptionPrefix: "Subscription",
  },
  agentTarget: {
    appliesTo: "Applies to",
    allAgents: "All agents",
    // "Only alpha" -- the agent id follows the word.
    onlyPrefix: "Only",
    contentAll: "Every agent under this scope reads this content.",
    // "{agent}" is substituted with the selected agent's identifier.
    contentOne:
      "Only {agent} workspaces read this content. An entry here overrides the all-agents one with the same name.",
    registryAll:
      "The model inventory is shared by every picoclaw agent. This picker only chooses the route the request takes; a per-user pin addresses the agent that user's workspace runs under.",
    registryOne:
      "Requests go through {agent}. The inventory itself is the same one every picoclaw agent shares.",
  },
  models: {
    noAgents: "No agents reported by the gateway, so the inventory cannot be reached.",
    incomplete: "Fill model name, provider and model.",
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
    title: "Which model this scope resolves to",
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
  members: {
    selectSubscription: "Select a subscription to see its members.",
    none: "No members under this subscription yet.",
    noPrivateFiles: "No private files.",
    deletePrefix: "Delete",
    deleteTitle: "Delete member's file?",
    deleteMessage:
      "“{name}” will be permanently removed from this member's private workspace.",
  },
  ladder: {
    editing: "editing",
    unreadable: "Instance-wide levels need instance-admin privileges",
    nothingSet: "Nothing set at this level",
    inEffect: "in effect",
    overridden: "overridden",
    notSet: "not set",
    locked: "not yours to see",
  },
};

export type AdminDict = typeof en;

const pt: AdminDict = {
  shell: {
    heading: "Administração",
    areaAria: "Área administrativa",
    scopedActions: "Ações por escopo",
    branding: "Marca",
    brandingNote:
      "Vale para toda a instância. A marca se aplica a todos neste deployment, então não há escopo a selecionar.",
    noAuthority:
      "Você não tem autoridade administrativa sobre nenhum escopo. Fale com um gestor de tenant ou de assinatura se achar que isso é um engano.",
    scopes: "Escopos",
    subscriptions: "Assinaturas",
    resizeScopes: "Redimensionar escopos",
    sectionsAria: "Seções deste escopo",
    tabs: {
      files: "Arquivos",
      secrets: "Segredos",
      skills: "Skills",
      model: "Modelos",
      members: "Membros",
    },
    reaches: "Alcança",
    andEverySubscription: " e todas as assinaturas sob ele",
    throughBefore: ", através de ",
    everyAgent: "todos os agentes",
    throughAfter: " apenas.",
    period: ".",
  },
  scope: {
    label: "Escopo",
    collapseTenant: "Recolher tenant",
    expandTenant: "Expandir tenant",
    tenantPrefix: "Tenant",
    subscriptionPrefix: "Assinatura",
  },
  agentTarget: {
    appliesTo: "Aplica-se a",
    allAgents: "Todos os agentes",
    onlyPrefix: "Apenas",
    contentAll: "Todos os agentes deste escopo leem este conteúdo.",
    contentOne:
      "Apenas os workspaces de {agent} leem este conteúdo. Uma entrada aqui sobrepõe a de todos os agentes com o mesmo nome.",
    registryAll:
      "O inventário de modelos é compartilhado por todos os agentes picoclaw. Este seletor escolhe apenas a rota da requisição; um pin por usuário endereça o agente sob o qual o workspace daquele usuário roda.",
    registryOne:
      "As requisições passam por {agent}. O inventário em si é o mesmo que todos os agentes picoclaw compartilham.",
  },
  models: {
    noAgents: "O gateway não reportou nenhum agente, então o inventário não pode ser acessado.",
    incomplete: "Preencha o nome do modelo, o provedor e o modelo.",
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
    title: "Para qual modelo este escopo resolve",
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
  members: {
    selectSubscription: "Selecione uma assinatura para ver seus membros.",
    none: "Nenhum membro nesta assinatura ainda.",
    noPrivateFiles: "Nenhum arquivo privado.",
    deletePrefix: "Excluir",
    deleteTitle: "Excluir o arquivo do membro?",
    deleteMessage:
      "“{name}” será removido permanentemente do workspace privado deste membro.",
  },
  ladder: {
    editing: "editando",
    unreadable: "Níveis de instância exigem privilégios de admin da instância",
    nothingSet: "Nada definido neste nível",
    inEffect: "em vigor",
    overridden: "sobreposto",
    notSet: "não definido",
    locked: "fora do seu alcance",
  },
};

export const adminCopy: Record<Locale, AdminDict> = { en, pt };
