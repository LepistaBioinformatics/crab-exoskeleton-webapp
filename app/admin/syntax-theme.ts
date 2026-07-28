// The token → colour map for highlighted code, kept free of any JSON or admin
// coupling.
//
// Roles are named by what a token MEANS, not by what a JSON grammar calls it, so a
// second language can adopt this without renaming anything: `name` is a key,
// property or identifier; `keyword` covers `true`/`false`/`null` here and reserved
// words elsewhere. The colours themselves live in globals.css as `--syntax-*`, in
// both light and dark, because that is where this app's theming lives.
//
// The intended second caller is the chat's markdown code blocks, which are
// multi-language and stream token-by-token — that needs a grammar per language and
// per-block memoization, and is not part of this change. What it will NOT need is
// to invent its own palette.

export type SyntaxRole =
  | "name"
  | "string"
  | "number"
  | "keyword"
  | "punct"
  | "comment"
  | "invalid"
  | "plain";

// `invalid` is the one role that is not just a colour: a squiggle says "this is
// not merely a different kind of token, it is wrong", which colour alone cannot.
export const ROLE_CLASS: Record<SyntaxRole, string> = {
  name: "text-syntax-name",
  string: "text-syntax-string",
  number: "text-syntax-number",
  keyword: "text-syntax-keyword",
  punct: "text-syntax-punct",
  comment: "text-syntax-comment italic",
  invalid: "text-blocked underline decoration-wavy decoration-blocked/70",
  // Inherits the surrounding colour: whitespace has nothing to colour, and giving
  // it a class would emit an element per run for no reason.
  plain: "",
};

export function roleClass(role: SyntaxRole): string {
  return ROLE_CLASS[role];
}
