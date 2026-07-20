# Filtros avançados de conversas — Design

**Data:** 2026-07-19
**Escopo:** `crab-exoskeleton-webapp` (submódulo)
**Status:** aprovado para planejamento

## Objetivo

Permitir filtrar a lista de conversas do chat por **tag**, **alias**, **texto**
e **data**, de forma simples e direta — pills que o usuário clica para adicionar
um tipo de filtro, complementadas por autocomplete inline (estilo GitHub). Os
filtros devem valer tanto no modo **lista** quanto no modo **tree** (que hoje
ignora a busca).

## Contexto atual

- `app/chat/history-sidebar.tsx` — sidebar que engloba os dois modos. Tem hoje
  um searchbox só no modo lista, com busca full-content debounced (300ms) que
  refaz um fan-out N+1 (`/api/chat/{role}/history`) por conversa a cada query,
  sem cache. `visible = searchResults ?? conversations` (linha 147) é a fonte
  única de render da lista.
- `app/chat/conversation-tree.tsx` — modo tree. Ignora a query (comentário
  "Tree view ignores the query (first cut)"). Mantém um `historyCache` a nível
  de módulo com o histórico de cada conversa.
- Modelo `ConversationSummary` (`lib/chatSession.ts`): `id`, `role`, `title`,
  `alias: string | null`, `tags: Tag[]` (`{name, value, metadata.color}`),
  `updatedAt: number` (ms epoch). **Não há `createdAt`** — a única data é
  `updatedAt`.
- Stack: Next 15 (App Router), React 19, Tailwind v4 + cva, `lucide-react`.
  Sem react-query. UI kit em `components/ui/`; pill de tag é `TagChip` em
  `app/chat/conversation-enrichment.tsx`.

## Arquitetura

### Motor de filtro em dois estágios (módulo puro)

Novo módulo `app/chat/conversation-filter.ts`, fonte única de verdade usada
pelos dois modos.

**Gramática de tokens** — `parseFilterQuery(input: string): FilterQuery`:

| Prefixo   | Semântica                                    | Repetível |
|-----------|----------------------------------------------|-----------|
| `tag:`    | substring no **nome** da tag                 | sim (OR)  |
| `alias:`  | substring no alias                           | sim (OR)  |
| `text:`   | substring em título + alias + **conteúdo**   | sim (OR)  |
| `date:`   | preset ou range sobre `updatedAt`            | sim (OR)  |
| (sem prefixo) | tratado como `text:` (mantém comportamento atual) | — |

`FilterQuery` = `{ tags: string[]; aliases: string[]; texts: string[]; dates: DateFilter[] }`.

**Estágio 1 — predicado síncrono** (`applySyncFilters(conversations, query)`):
função pura sobre dados já presentes em `ConversationSummary` (`tags`, `alias`,
`updatedAt`). Roda na hora, sem rede, sem spinner.

**Estágio 2 — conteúdo assíncrono** (`applyContentFilter(candidates, texts, ...)`):
só roda quando há token `text:`, e **apenas sobre os sobreviventes do estágio 1**.
Lê o histórico das mensagens pelo cache compartilhado. Protegido por
`AbortController` / token de requisição — a última query vence, teclas antigas
são canceladas.

**Semântica de combinação:** AND entre tipos, OR dentro do mesmo tipo.
Ex.: `tag:urgente tag:bug alias:cli` → `(tag~urgente OU tag~bug) E (alias~cli)`.

**Datas:** superset presets + range sobre `updatedAt`.
- Presets: `hoje`, `7d`, `30d`, `<ano>` (ex.: `2026`).
- Range: `date:2026-01-01..2026-03-01` (início/fim inclusivos).
- Range inválido → token ignorado (não filtra errado).

### Cache de histórico compartilhado

Extrair o `historyCache` de `conversation-tree.tsx` para `app/chat/history-cache.ts`
(ex.: `getHistory(workspace, conversation): Promise<HistoryMessage[]>` com cache
por id de conversa). O estágio 2 e o tree passam a ler do mesmo cache.

Consequências:
- Modo tree: filtrar por conteúdo é quase de graça (histórico já carregado).
- Modo lista: cache amortece o N+1 entre teclas.
- Com narrow-first + cache + debounce + abort, "sempre buscar conteúdo" tem
  custo controlado.

## UI

Novo componente `app/chat/conversation-search-bar.tsx`, renderizado no topo do
`HistorySidebar` **fora** do bloco condicional de modo, servindo lista e tree.

- **Pills (entrada principal, sempre visíveis):** `+ Tag`, `+ Alias`, `+ Texto`,
  `+ Data`. Clicar insere o prefixo (`tag:`) na barra, foca o input e abre o
  autocomplete.
- **Autocomplete inline:** ao digitar `tag:`/`alias:`, sugere valores derivados
  **puramente do array `conversations` em memória** (zero chamadas à API):
  - `tag:` → nomes de tags deduplicados, com a cor do `TagChip`.
  - `alias:` → aliases existentes.
  - `date:` → presets fixos.
  - `text:` → texto livre, sem sugestão.
  - Navegação: ↑/↓ move, Enter/Tab confirma, Esc fecha.

**Estado:** o filtro mora no `HistorySidebar` (componente que engloba os dois
modos), então alternar lista↔tree preserva os filtros naturalmente. Sem URL
fragment nesta versão.

**Aplicação nos modos:**
- Lista: `visible` passa a vir do motor (síncrono + conteúdo) no lugar do
  `searchResults ?? conversations` atual.
- Tree: `ConversationTree` recebe o conjunto já filtrado (em vez do array
  completo).

Reuso: `Input`, `IconButton`, padrão visual de `TagChip`/`Badge`.

## Erros e edge cases

- Falha/abort no fetch de histórico (`text:`) → conversa tratada como
  "não casou"; erro de abort ignorado silenciosamente.
- Query vazia ou prefixo sem valor (`tag:`) → ignorada, mostra tudo.
- Range de data inválido → token ignorado.
- Sem resultados → estado vazio já existente na sidebar.
- Bug latente corrigido: o efeito atual (`history-sidebar.tsx` L104-145) refaz
  o fan-out N+1 sem cache e sem abortar fetches em voo (só guarda a escrita via
  flag `cancelled`). O novo motor adiciona cache + AbortController + narrow-first.

## Testes (alvo principal de TDD)

`parseFilterQuery` e `applySyncFilters` são puros:
- Parsing: cada prefixo; tags repetidas; texto livre sem prefixo; preset vs
  range de data; valores com espaço/aspas.
- Semântica: AND entre tipos; OR dentro do tipo; `updatedAt` dentro/fora do
  range; range inválido ignorado.
- Estágio de conteúdo: só roda sobre sobreviventes; latest-query-wins sob
  resolução fora de ordem.

## Premissas

- **Data:** o usuário não marcou "Ambos" explicitamente (anotou "presets
  relativos ou ranges"). Segue-se o superset — presets como via principal, range
  como extra fino. Ajustável para só-presets se desejado.
- `tag:` casa por nome (substring), não por valor, salvo indicação contrária.
