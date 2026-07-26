import type { Locale } from "./config";

// Copy for the whole /chat experience, sub-keyed by component -- the same
// shape landing.ts uses (t.hero.title, t.memory.body).
//
// Proper nouns are not translated: Canvas and Tree are the product's names for
// the two views, and agent/workspace identifiers come from the API.

const en = {
  shell: {
    openWorkspaces: "Open workspaces",
    conversations: "Conversations",
    workspaces: "Workspaces",
    // Rendered as "<agentPrefix> <role>" in the mobile top bar.
    agentPrefix: "agent",
  },
  pane: {
    // Prefixes, completed with the pane's own name: "Expand Conversations".
    expand: "Expand",
    resize: "Resize",
  },
  nav: {
    collapseWorkspaces: "Collapse Workspaces",
    collapse: "Collapse",
  },
  emptyState: {
    title: "Pick a workspace to start",
    body: "Choose a tenant, account, and agent on the left. Its conversations open in a second panel, ready for you to type.",
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
  viewMode: {
    chat: "Chat",
    chatTitle: "Traditional chat",
    canvas: "Canvas",
    canvasTitle: "Canvas timeline",
  },
  workspaceNav: {
    filterPlaceholder: "Filter workspaces",
    noMatch: "No workspaces match your filter.",
  },
  install: {
    action: "Install app",
    // Split around the two <strong> control names Safari itself uses.
    iosHelpBefore: "On iPhone and iPad, tap ",
    iosShare: "Share",
    iosHelpMiddle: " in Safari, then ",
    iosAddToHome: "Add to Home Screen",
    iosHelpAfter: ". Safari has no install button of its own — that flow is the install.",
  },
};

export type ChatDict = typeof en;

const pt: ChatDict = {
  shell: {
    openWorkspaces: "Abrir workspaces",
    conversations: "Conversas",
    workspaces: "Workspaces",
    agentPrefix: "agente",
  },
  pane: {
    expand: "Expandir",
    resize: "Redimensionar",
  },
  nav: {
    collapseWorkspaces: "Recolher Workspaces",
    collapse: "Recolher",
  },
  emptyState: {
    title: "Escolha um workspace para começar",
    body: "Escolha um tenant, uma conta e um agente à esquerda. As conversas dele abrem em um segundo painel, prontas para você escrever.",
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
  viewMode: {
    chat: "Chat",
    chatTitle: "Chat tradicional",
    canvas: "Canvas",
    canvasTitle: "Linha do tempo do Canvas",
  },
  workspaceNav: {
    filterPlaceholder: "Filtrar workspaces",
    noMatch: "Nenhum workspace corresponde ao filtro.",
  },
  install: {
    action: "Instalar app",
    iosHelpBefore: "No iPhone e no iPad, toque em ",
    iosShare: "Compartilhar",
    iosHelpMiddle: " no Safari e depois em ",
    iosAddToHome: "Adicionar à Tela de Início",
    iosHelpAfter: ". O Safari não tem um botão de instalar próprio — esse é o fluxo de instalação.",
  },
};

export const chatCopy: Record<Locale, ChatDict> = { en, pt };
