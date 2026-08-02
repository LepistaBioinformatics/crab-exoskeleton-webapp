import type { Locale } from "./config";

// The route handlers under app/api/** already speak in codes, not prose
// ("invalid_request", "session_expired", "connectivity", ...), so nothing
// server-side needs to know about locales. The codes are turned into text here,
// at the point of display.
//
// This also closes a leak: the old per-module mappers passed an unrecognised
// code straight through to setError, so a user could be shown the literal
// string "invalid_request".

const en = {
  invalid_request: "Something in that request wasn't right.",
  session_expired: "Your session expired — sign in again.",
  connectivity: "Can't reach the gateway right now.",
  not_found: "We couldn't find that.",
  forbidden: "You don't have permission to do that.",
  media_reserved: "That folder is managed by the system and cannot be created, renamed or deleted.",
  invalid_instance: "That workspace isn't available.",
  unsupported_type: "That file type isn't supported.",
  too_large: "That file is too large.",
  note_too_long: "This note is too long.",
  native_is_admin_only: "Only an administrator can change this.",
  invalid_email: "That email address doesn't look right.",
  invalid_code: "Invalid code. Try again.",
  workspaces_load_failed: "Couldn't load your workspaces.",
  version_conflict: "Another admin changed this model — reload before saving.",
  models_incomplete: "Fill model name, provider and model.",
  gateway_retries_exhausted:
    "Still can't reach the gateway after several attempts. Try again shortly.",
  unknown: "Something went wrong.",
};

export type ErrorDict = typeof en;

const pt: ErrorDict = {
  invalid_request: "Algo nessa requisição não estava certo.",
  session_expired: "Sua sessão expirou — entre novamente.",
  connectivity: "Não foi possível falar com o gateway agora.",
  not_found: "Não encontramos isso.",
  forbidden: "Você não tem permissão para fazer isso.",
  media_reserved: "Essa pasta é gerenciada pelo sistema e não pode ser criada, renomeada ou excluída.",
  invalid_instance: "Esse workspace não está disponível.",
  unsupported_type: "Esse tipo de arquivo não é suportado.",
  too_large: "Esse arquivo é grande demais.",
  note_too_long: "Esta nota é longa demais.",
  native_is_admin_only: "Apenas um administrador pode alterar isso.",
  invalid_email: "Esse e-mail não parece válido.",
  invalid_code: "Código inválido. Tente de novo.",
  workspaces_load_failed: "Não foi possível carregar seus workspaces.",
  version_conflict: "Outro admin alterou este modelo — recarregue antes de salvar.",
  models_incomplete: "Preencha o nome do modelo, o provedor e o modelo.",
  gateway_retries_exhausted:
    "Ainda não foi possível falar com o gateway após várias tentativas. Tente daqui a pouco.",
  unknown: "Algo deu errado.",
};

export const errorCopy: Record<Locale, ErrorDict> = { en, pt };

// Reduces a failed Response to one of the codes above. Replaces the five
// near-identical `errorMessage` helpers that used to live in lib/admin.ts,
// lib/adminSkills.ts, lib/media.ts, lib/memory.ts and lib/secrets.ts -- they
// each threw English, which is exactly what made those modules untranslatable.
export async function errorCode(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  const e = data?.error;
  if (typeof e === "string" && e.trim()) return e.trim();
  if (res.status === 401) return "session_expired";
  if (res.status === 403) return "forbidden";
  if (res.status === 404) return "not_found";
  if (res.status === 413) return "too_large";
  return "unknown";
}

export function errorText(dict: ErrorDict, code: unknown): string {
  return typeof code === "string" && code in dict
    ? dict[code as keyof ErrorDict]
    : dict.unknown;
}
