// The grammars this app can colour, each behind its own lazy `import()`.
//
// An EXPLICIT map, not a template-literal import, and that is forced rather than
// chosen: `import(`highlight.js/lib/languages/${id}`)` makes webpack build a context
// module, which needs to resolve the DIRECTORY `highlight.js/lib/languages` — and the
// package's `exports` field publishes only `./lib/languages/*`, the files. It builds
// under vitest (Vite resolves it) and fails `next build`, which is how it was caught.
//
// Each entry still costs nothing until used: webpack splits it into its own chunk,
// the service worker caches `/_next/static/*.js` cache-first, so a conversation with
// no code loads no grammar and one with a Go block loads Go alone.
//
// The trade this imposes: coverage is what is listed here, not all 384 grammars
// highlight.js ships. Adding one is a single line, and an unlisted language renders
// plain — the same as before this feature existed, so there is no regression, only a
// ceiling. Kept to the languages an agent plausibly writes; see the spec's DEFER-4
// for generating the full set.

type GrammarLoader = () => Promise<{ default: unknown }>;

export const GRAMMARS: Record<string, GrammarLoader> = {
  bash: () => import("highlight.js/lib/languages/bash"),
  c: () => import("highlight.js/lib/languages/c"),
  clojure: () => import("highlight.js/lib/languages/clojure"),
  cmake: () => import("highlight.js/lib/languages/cmake"),
  coffeescript: () => import("highlight.js/lib/languages/coffeescript"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  css: () => import("highlight.js/lib/languages/css"),
  dart: () => import("highlight.js/lib/languages/dart"),
  diff: () => import("highlight.js/lib/languages/diff"),
  django: () => import("highlight.js/lib/languages/django"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  dos: () => import("highlight.js/lib/languages/dos"),
  elixir: () => import("highlight.js/lib/languages/elixir"),
  elm: () => import("highlight.js/lib/languages/elm"),
  erlang: () => import("highlight.js/lib/languages/erlang"),
  fortran: () => import("highlight.js/lib/languages/fortran"),
  fsharp: () => import("highlight.js/lib/languages/fsharp"),
  go: () => import("highlight.js/lib/languages/go"),
  gradle: () => import("highlight.js/lib/languages/gradle"),
  graphql: () => import("highlight.js/lib/languages/graphql"),
  groovy: () => import("highlight.js/lib/languages/groovy"),
  haskell: () => import("highlight.js/lib/languages/haskell"),
  haxe: () => import("highlight.js/lib/languages/haxe"),
  ini: () => import("highlight.js/lib/languages/ini"),
  java: () => import("highlight.js/lib/languages/java"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  json: () => import("highlight.js/lib/languages/json"),
  julia: () => import("highlight.js/lib/languages/julia"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  latex: () => import("highlight.js/lib/languages/latex"),
  less: () => import("highlight.js/lib/languages/less"),
  lisp: () => import("highlight.js/lib/languages/lisp"),
  lua: () => import("highlight.js/lib/languages/lua"),
  makefile: () => import("highlight.js/lib/languages/makefile"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  matlab: () => import("highlight.js/lib/languages/matlab"),
  nginx: () => import("highlight.js/lib/languages/nginx"),
  nim: () => import("highlight.js/lib/languages/nim"),
  objectivec: () => import("highlight.js/lib/languages/objectivec"),
  ocaml: () => import("highlight.js/lib/languages/ocaml"),
  perl: () => import("highlight.js/lib/languages/perl"),
  pgsql: () => import("highlight.js/lib/languages/pgsql"),
  php: () => import("highlight.js/lib/languages/php"),
  'php-template': () => import("highlight.js/lib/languages/php-template"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  prolog: () => import("highlight.js/lib/languages/prolog"),
  properties: () => import("highlight.js/lib/languages/properties"),
  protobuf: () => import("highlight.js/lib/languages/protobuf"),
  puppet: () => import("highlight.js/lib/languages/puppet"),
  python: () => import("highlight.js/lib/languages/python"),
  r: () => import("highlight.js/lib/languages/r"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  rust: () => import("highlight.js/lib/languages/rust"),
  scala: () => import("highlight.js/lib/languages/scala"),
  scheme: () => import("highlight.js/lib/languages/scheme"),
  scss: () => import("highlight.js/lib/languages/scss"),
  shell: () => import("highlight.js/lib/languages/shell"),
  sql: () => import("highlight.js/lib/languages/sql"),
  swift: () => import("highlight.js/lib/languages/swift"),
  tcl: () => import("highlight.js/lib/languages/tcl"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  vbnet: () => import("highlight.js/lib/languages/vbnet"),
  verilog: () => import("highlight.js/lib/languages/verilog"),
  vhdl: () => import("highlight.js/lib/languages/vhdl"),
  vim: () => import("highlight.js/lib/languages/vim"),
  wasm: () => import("highlight.js/lib/languages/wasm"),
  x86asm: () => import("highlight.js/lib/languages/x86asm"),
  xml: () => import("highlight.js/lib/languages/xml"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
};

export function isKnownGrammar(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(GRAMMARS, id);
}
