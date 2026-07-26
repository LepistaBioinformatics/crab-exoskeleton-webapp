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
