import type { Locale } from "./config";

// Landing-page copy, per locale. Every user-visible string on the pre-auth
// landing flows through here. Claims are deliberately grounded in the actual
// implementation (kernel isolation between users' agents, write-only secret
// injection out of band from chat, operator-defined agent templates cloned per
// user, filename filtering) -- not overstated. Proper nouns (Mycelium, PicoClaw,
// crab-shell-proxy, ...) are product names and stay untranslated.

const en = {
  top: {
    language: "Language",
    enter: "Enter",
  },
  hero: {
    eyebrow: "Grown, not generated",
    title: "Watch a thought take shape.",
    lead: "Your reasoning never moves in a straight line — it branches, pauses, and grows back on itself. zombie-crab gives every conversation a living structure you can see, name, and return to.",
    cta: "Enter",
    scrollHint: "Follow the thread",
  },
  thought: {
    index: "01",
    eyebrow: "Lines of thought",
    title: "Two ways to see how you got here.",
    body: "Canvas draws every conversation as a lane on a timeline — each message a node, growing left to right as the thought unfolds. Tree turns the same history into branches, so you can see where an idea split and which path you took. The evolution of a thought, made visible.",
    canvasCaption: "Canvas — conversations as growing timelines",
    treeCaption: "Tree — where each idea branched",
    next: "A thought you can see is one you'll want to keep",
  },
  memory: {
    index: "02",
    eyebrow: "Memory you control",
    title: "Name it, color it, find it again.",
    body: "Give any conversation an alias, tag it, and pick a color. Later, filter your whole history by tag, alias, text, or date. A mini-tag opens on hover to show what's inside — nothing important gets lost in the scroll.",
    filterHint: "tag:   alias:   text:   date:",
    tagExamples: ["research", "urgent", "draft"],
    next: "But what does it remember about your work?",
  },
  graph: {
    index: "03",
    eyebrow: "What it learns on its own",
    // Every claim here is deliberately narrow — see
    // .specs/features/landing-refresh-memory-graph/spec.md. It is a browsable
    // record, not a network diagram; the search ranks text, it does not understand
    // meaning; and the graph belongs to one member and one agent.
    title: "It remembers the things, not just the words.",
    body: "As you talk, your agent records what matters — people, projects, systems, and how they connect — into a knowledge graph it keeps for you. Not a transcript it re-reads: named things it can look up. You can open that graph, browse it by type, search it, and see which conversation each fact came out of when it can be traced.",
    entity: "Zombie Crab",
    entityType: "project",
    observation: "Runs DeepSeek on the alpha instance",
    relationVerb: "depends on",
    relationTo: "Mycelium gateway",
    sourceLabel: "from",
    sourceChat: "Stack review",
    points: [
      "Served by an MCP server inside the gateway — no extra container, no external service, nothing to download.",
      "Yours alone: one graph per member, per agent. Nothing is pooled.",
      "Read-only for you: the agent writes it, you audit it.",
    ],
    next: "So who gets to see any of this?",
  },
  isolation: {
    index: "04",
    eyebrow: "Isolation & secrets",
    title: "A real agent of your own, walled off by the kernel.",
    body: "Every user gets a private agent in its own container — separate volume, non-root, no shared surface. Isolation between users' agents is enforced by the Linux kernel, not by application filters.",
    points: [
      "One container, one volume, one non-root agent — per user.",
      "Secrets are write-only: entered once, never shown or returned.",
      "Injected out of band — mounted read-only into your agent, never through chat.",
    ],
    chatLabel: "Chat channel",
    chatSub: "your messages only",
    secretLabel: "Secret channel",
    secretSub: "write-only, read-only mount",
    harnessLabel: "Your isolated agent",
    next: "Zoom out: how the whole thing stays sealed",
  },
  defense: {
    index: "05",
    eyebrow: "One authenticated door",
    title: "Many parts. A single way in.",
    body: "Every request enters through the Mycelium API Gateway — one authenticated door. Behind it, each piece does one job and each user's agent stays isolated. Security here isn't a single wall; it's the shape of the whole system.",
    doorLabel: "Authenticated door",
    groups: { infra: "Infrastructure", ai: "AI", external: "External" },
    caption: "The zombie-crab stack, grouped by role",
    next: "Behind the door: a structure built for teams",
  },
  hierarchy: {
    index: "06",
    eyebrow: "Built for organizations",
    title: "A hierarchy your company already recognizes.",
    body: "Powered by Mycelium's multitenancy, access nests the way an organization does: a tenant holds subscription accounts, each account holds agents, and each agent is shared with members — with read or write permission, per person. Corporate structure, expressed as software.",
    labels: {
      tenant: "Tenant",
      account: "Subscription account",
      agent: "Agent",
      member: "Member",
    },
    sample: {
      tenant: "Acme Corp",
      account: "Research",
      agentA: "alpha",
      agentB: "beta",
      member: "you@acme.com",
    },
    perms: { read: "read", write: "write" },
    next: "And every agent can be shaped to fit",
  },
  templates: {
    index: "07",
    eyebrow: "Agents, templated",
    title: "Custom agents, cloned clean for everyone.",
    body: "Operators define an agent from a template — its persona, skills, and memory. Every user gets a private, isolated clone on first use. Admins register and assign models per user, and publish shared skills and files that cascade read-only to everyone in scope.",
    points: [
      "Templated persona, skills and memory — seeded once, per user.",
      "Per-user model registry and assignment.",
      "Shared skills and files cascade read-only across a scope.",
    ],
    next: "Next: work that runs itself",
  },
  scheduled: {
    index: "08",
    eyebrow: "Work that runs itself",
    title: "Ask once. It keeps doing it.",
    // Every claim here is bounded on purpose, and landing-accuracy.test.ts holds the
    // bounds: tasks are created by ASKING THE AGENT (the panel is read-only), and no
    // per-run outcome is recorded anywhere, so the panel cannot say a run succeeded.
    body: "Tell your agent to compile a report every evening and it will — on its own, while you are not there. The Tasks panel lists what is scheduled, when it last ran and when it runs next, and opens any past run in full: the prompt it woke up with, every tool it reached for, and what it produced. Reference a task or one of its runs straight into the chat to ask about it.",
    points: [
      "You schedule it by asking; the panel is where you read it back.",
      "Every past run kept in full, tool calls included.",
      "Finished one-off tasks tucked away by default.",
    ],
    next: "One last piece: your files",
    sample: {
      name: "Daily report",
      schedule: "every day, 18:00",
      lastRun: "last run 2h ago",
      nextRun: "next 18:00",
      runs: ["yesterday, 18:00", "2 days ago, 18:00"],
      toolCall: "web_search",
    },
  },
  files: {
    index: "09",
    eyebrow: "Files, in reach",
    title: "Drop a file in. Find it by name.",
    body: "Attach files straight from the composer; they land in your agent's own workspace, and it reads them by path — the bytes never clutter the chat. Organise them the way you think: make folders, rename them, and drag files and folders between them. Filter by name to pull one back in seconds. Admins can share files that cascade read-only to a whole scope.",
    filterPlaceholder: "Filter files",
    sample: ["assay-results.csv", "protocol.pdf", "notes.md", "figure-2.png"],
    folderSample: ["protocols", "figures"],
    next: "Ready to see your first thought take shape?",
  },
  // Accessible names for the SVG figures, and the mock conversation titles
  // inside them. The node labels in ComponentMap are product names and stay
  // untranslated.
  diagrams: {
    hero: "Branching lines of thought growing like mycelium",
    canvas: "Canvas timeline: conversations as lanes with message nodes",
    tree: "Conversation tree: an idea branching into paths",
    map: "The zombie-crab stack: components behind a single authenticated gateway",
    graph:
      "A knowledge-graph entry: an entity with its type, an observation, a link and the conversation it came from",
    sampleConversations: [
      "Assay pipeline v3 — normalization",
      "Grant draft — methods section",
    ],
  },
  cta: {
    eyebrow: "Your agent is waiting",
    title: "Step through the door.",
    body: "Sign in with your email — no password. Your isolated agent, your history, your structure.",
    button: "Enter zombie-crab",
    footnote: "An AI harness stack by Lepista Bioinformatics.",
  },
};

export type LandingDict = typeof en;

const pt: LandingDict = {
  top: {
    language: "Idioma",
    enter: "Entrar",
  },
  hero: {
    eyebrow: "Cultivado, não gerado",
    title: "Veja um pensamento tomar forma.",
    lead: "Seu raciocínio nunca segue em linha reta — ele ramifica, pausa e volta sobre si mesmo. O zombie-crab dá a cada conversa uma estrutura viva que você pode ver, nomear e retomar.",
    cta: "Entrar",
    scrollHint: "Siga o fio",
  },
  thought: {
    index: "01",
    eyebrow: "Linhas de pensamento",
    title: "Dois jeitos de ver como você chegou aqui.",
    body: "O Canvas desenha cada conversa como uma trilha numa linha do tempo — cada mensagem um nó, crescendo da esquerda para a direita conforme o pensamento se desenrola. A Árvore transforma o mesmo histórico em ramos, mostrando onde uma ideia se dividiu e qual caminho você seguiu. A evolução de um pensamento, tornada visível.",
    canvasCaption: "Canvas — conversas como linhas do tempo que crescem",
    treeCaption: "Árvore — onde cada ideia se ramificou",
    next: "Um pensamento que você vê é um que vai querer guardar",
  },
  memory: {
    index: "02",
    eyebrow: "Memória sob seu controle",
    title: "Nomeie, colora, reencontre.",
    body: "Dê um alias a qualquer conversa, marque com tags e escolha uma cor. Depois, filtre todo o histórico por tag, alias, texto ou data. Uma mini-tag se abre ao passar o mouse para mostrar o que há dentro — nada importante se perde na rolagem.",
    filterHint: "tag:   alias:   text:   date:",
    tagExamples: ["pesquisa", "urgente", "rascunho"],
    next: "Mas o que ele lembra do seu trabalho?",
  },
  graph: {
    index: "03",
    eyebrow: "O que ele aprende por conta própria",
    title: "Ele lembra das coisas, não só das palavras.",
    body: "Conforme vocês conversam, seu agente registra o que importa — pessoas, projetos, sistemas e como se ligam — num grafo de conhecimento que ele mantém para você. Não é um histórico relido: são coisas nomeadas que ele consulta. Você abre esse grafo, navega por tipo, busca nele e vê de qual conversa cada fato saiu, quando dá para rastrear.",
    entity: "Zombie Crab",
    entityType: "projeto",
    observation: "Usa DeepSeek na instância alpha",
    relationVerb: "depende de",
    relationTo: "Gateway mycelium",
    sourceLabel: "de",
    sourceChat: "Revisão da stack",
    points: [
      "Servido por um MCP dentro do gateway — sem container extra, sem serviço externo, sem nada para baixar.",
      "Só seu: um grafo por membro, por agente. Nada é agrupado.",
      "Somente leitura para você: o agente escreve, você audita.",
    ],
    next: "E quem pode ver tudo isso?",
  },
  isolation: {
    index: "04",
    eyebrow: "Isolamento & segredos",
    title: "Um agente de verdade, só seu, isolado pelo kernel.",
    body: "Cada usuário recebe um agente privado no próprio contêiner — volume separado, sem root, nenhuma superfície compartilhada. O isolamento entre os agentes dos usuários é garantido pelo kernel do Linux, não por filtros de aplicação.",
    points: [
      "Um contêiner, um volume, um agente sem root — por usuário.",
      "Segredos são write-only: digitados uma vez, nunca exibidos ou devolvidos.",
      "Injetados fora de banda — montados read-only no seu agente, nunca pelo chat.",
    ],
    chatLabel: "Canal do chat",
    chatSub: "só as suas mensagens",
    secretLabel: "Canal de segredos",
    secretSub: "write-only, montagem read-only",
    harnessLabel: "Seu agente isolado",
    next: "Afaste a lente: como tudo permanece vedado",
  },
  defense: {
    index: "05",
    eyebrow: "Uma única porta autenticada",
    title: "Muitas partes. Uma só entrada.",
    body: "Toda requisição entra pelo Mycelium API Gateway — uma única porta autenticada. Atrás dela, cada peça faz uma coisa e o agente de cada usuário permanece isolado. Segurança aqui não é um muro só; é o formato do sistema inteiro.",
    doorLabel: "Porta autenticada",
    groups: { infra: "Infraestrutura", ai: "IA", external: "Externo" },
    caption: "A stack do zombie-crab, agrupada por função",
    next: "Atrás da porta: uma estrutura feita para times",
  },
  hierarchy: {
    index: "06",
    eyebrow: "Feito para organizações",
    title: "Uma hierarquia que sua empresa já reconhece.",
    body: "Movida pela multitenancy do Mycelium, o acesso se aninha como uma organização: um tenant contém contas de subscrição, cada conta contém agentes, e cada agente é compartilhado com membros — com permissão de leitura ou escrita, por pessoa. Estrutura corporativa, expressa em software.",
    labels: {
      tenant: "Tenant",
      account: "Conta de subscrição",
      agent: "Agente",
      member: "Membro",
    },
    sample: {
      tenant: "Acme Corp",
      account: "Pesquisa",
      agentA: "alpha",
      agentB: "beta",
      member: "voce@acme.com",
    },
    perms: { read: "leitura", write: "escrita" },
    next: "E cada agente pode ser moldado sob medida",
  },
  templates: {
    index: "07",
    eyebrow: "Agentes, com template",
    title: "Agentes customizados, clonados limpos para cada um.",
    body: "Operadores definem um agente a partir de um template — sua persona, skills e memória. Cada usuário recebe um clone privado e isolado no primeiro uso. Admins registram e atribuem modelos por usuário e publicam skills e arquivos compartilhados que cascateiam read-only para todos no escopo.",
    points: [
      "Persona, skills e memória via template — semeados uma vez, por usuário.",
      "Registro e atribuição de modelos por usuário.",
      "Skills e arquivos compartilhados cascateiam read-only por escopo.",
    ],
    next: "Agora: trabalho que roda sozinho",
  },
  scheduled: {
    index: "08",
    eyebrow: "Trabalho que roda sozinho",
    title: "Peça uma vez. Ele continua fazendo.",
    body: "Peça ao seu agente para compilar um relatório toda noite e ele compila — por conta própria, enquanto você não está. O painel de Tarefas lista o que está agendado, quando rodou pela última vez e quando roda de novo, e abre qualquer execução passada por inteiro: o comando com que ele acordou, cada ferramenta que usou e o que produziu. Referencie uma tarefa ou uma execução direto no chat para perguntar sobre ela.",
    points: [
      "Você agenda pedindo; o painel é onde você confere.",
      "Cada execução passada guardada por inteiro, com as chamadas de ferramenta.",
      "Tarefas de uma vez já concluídas ficam recolhidas por padrão.",
    ],
    next: "Falta uma peça: seus arquivos",
    sample: {
      name: "Relatório diário",
      schedule: "todo dia, 18:00",
      lastRun: "última há 2h",
      nextRun: "próxima 18:00",
      runs: ["ontem, 18:00", "há 2 dias, 18:00"],
      toolCall: "web_search",
    },
  },
  files: {
    index: "09",
    eyebrow: "Arquivos ao alcance",
    title: "Solte um arquivo. Ache pelo nome.",
    body: "Anexe arquivos direto do compositor; eles chegam ao workspace do seu próprio agente, que os lê por caminho — os bytes nunca poluem o chat. Organize do jeito que você pensa: crie pastas, renomeie e arraste arquivos e pastas entre elas. Filtre pelo nome para resgatar um em segundos. Admins podem compartilhar arquivos que cascateiam read-only para um escopo inteiro.",
    filterPlaceholder: "Filtrar arquivos",
    sample: [
      "resultados-ensaio.csv",
      "protocolo.pdf",
      "notas.md",
      "figura-2.png",
    ],
    folderSample: ["protocolos", "figuras"],
    next: "Pronto para ver seu primeiro pensamento tomar forma?",
  },
  diagrams: {
    hero: "Linhas de pensamento se ramificando como micélio",
    canvas:
      "Linha do tempo do Canvas: conversas como faixas com nós de mensagens",
    tree: "Árvore de conversas: uma ideia se ramificando em caminhos",
    map: "A stack zombie-crab: componentes atrás de um único gateway autenticado",
    graph:
      "Um registro do grafo de conhecimento: uma entidade com seu tipo, uma observação, uma ligação e a conversa de onde veio",
    sampleConversations: [
      "Pipeline de ensaio v3 — normalização",
      "Rascunho de projeto — seção de métodos",
    ],
  },
  cta: {
    eyebrow: "Seu agente está esperando",
    title: "Atravesse a porta.",
    body: "Entre com seu e-mail — sem senha. Seu agente isolado, seu histórico, sua estrutura.",
    button: "Entrar no zombie-crab",
    footnote: "Uma stack de harness de IA da Lepista Bioinformatics.",
  },
};

export const landingCopy: Record<Locale, LandingDict> = { en, pt };
