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
  composer: {
    replyingToBefore: "Replying to ",
    replyingToUser: "you",
    replyingToAgent: "the agent",
    replyNoText: "(no text)",
    cancelReply: "Cancel reply",
    removeAttachment: "Remove",
    slashCommands: "Slash commands",
    placeholder: "Message your agent…",
    placeholderHint: "Message your agent…  (Shift+Enter for a new line)",
    attach: "Attach file",
    advancedEditor: "Advanced markdown editor",
    send: "Send message",
  },
  attachment: {
    download: "Download file",
    downloading: "Downloading…",
  },
  markdownEditor: {
    aria: "Markdown editor",
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
    placeholder: "e.g. Always answer in Portuguese. Our stack is Next.js + Go…",
  },
  view: {
    // Attribution inside the blockquote a reply inserts into the message.
    quoteUser: "You",
    quoteAgent: "Agent",
    replyAria: "Reply to this message",
    reply: "Reply",
    agentPrefix: "agent",
    secrets: "Agent secrets",
    files: "Workspace files",
    // "…retrying… (attempt 2 of 3)"
    retrying: "Couldn't reach the gateway — retrying… (attempt {n} of {total})",
    settling: "We're storing your file…",
  },
  commands: {
    renameUsage: "Usage: /rename <new title>",
    renamed: "Chat renamed to “{title}”.",
    renameFailed: "Couldn't rename it.",
    tagUsage: "Usage: /tag <name> [value] [#color]",
    tagApplied: "Tag “{name}” applied.",
    tagFailed: "Couldn't apply the tag.",
    unknown: "Unknown command: {cmd}. Try /rename or /tag.",
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
  composer: {
    replyingToBefore: "Respondendo a ",
    replyingToUser: "você",
    replyingToAgent: "o agente",
    replyNoText: "(sem texto)",
    cancelReply: "Cancelar resposta",
    removeAttachment: "Remover",
    slashCommands: "Comandos de barra",
    placeholder: "Escreva para o seu agente…",
    placeholderHint: "Escreva para o seu agente…  (Shift+Enter para nova linha)",
    attach: "Anexar arquivo",
    advancedEditor: "Editor markdown avançado",
    send: "Enviar mensagem",
  },
  attachment: {
    download: "Baixar arquivo",
    downloading: "Baixando…",
  },
  markdownEditor: {
    aria: "Editor markdown",
    hidePreview: "Ocultar prévia",
    showPreview: "Mostrar prévia",
    closeTitle: "Fechar (Esc)",
    placeholder: "Escreva em markdown…  (Ctrl/⌘+Enter para enviar, Esc para fechar)",
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
    placeholder: "ex.: Sempre responda em português. Nossa stack é Next.js + Go…",
  },
  view: {
    quoteUser: "Você",
    quoteAgent: "Agente",
    replyAria: "Responder a esta mensagem",
    reply: "Responder",
    agentPrefix: "agente",
    secrets: "Segredos do agente",
    files: "Arquivos do workspace",
    retrying: "Não foi possível falar com o gateway — tentando de novo… (tentativa {n} de {total})",
    settling: "Estamos guardando o arquivo para você…",
  },
  commands: {
    renameUsage: "Uso: /rename <novo título>",
    renamed: "Chat renomeado para “{title}”.",
    renameFailed: "Não consegui renomear.",
    tagUsage: "Uso: /tag <nome> [valor] [#cor]",
    tagApplied: "Tag “{name}” aplicada.",
    tagFailed: "Não consegui aplicar a tag.",
    unknown: "Comando desconhecido: {cmd}. Tente /rename ou /tag.",
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
