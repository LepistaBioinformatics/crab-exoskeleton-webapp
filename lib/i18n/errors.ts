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
  // agent-projects: two upstream outcomes that are ordinary answers, not
  // failures — a generic message would leave someone retyping a name that can
  // never be accepted, or waiting for a feature this agent will never have.
  project_name_taken: "You already have a project with that name.",
  projects_unsupported: "This agent does not support projects.",
  native_is_admin_only: "Only an administrator can change this.",
  invalid_email: "That email address doesn't look right.",
  invalid_code: "Invalid code. Try again.",
  workspaces_load_failed: "Couldn't load your workspaces.",
  version_conflict: "Another admin changed this model — reload before saving.",
  models_incomplete: "Fill model name, provider and model.",
  gateway_retries_exhausted:
    "Still can't reach the gateway after several attempts. Try again shortly.",
  // user-owned-models. The probe answers with an error CLASS, never the
  // provider's response body, so each of these has to name the fix rather than
  // quote an upstream message the member cannot act on.
  probe_bad_key: "The endpoint refused that API key.",
  probe_bad_endpoint:
    "That host answered, but there is no chat endpoint at that path — check the URL still has its version path, e.g. /v1.",
  probe_rate_limited: "Your provider is rate-limiting this key right now.",
  probe_provider_error: "The provider answered with an error of its own. Try again later.",
  probe_timeout: "The endpoint did not answer in time.",
  probe_dns: "That host name could not be resolved.",
  probe_tls: "The endpoint's certificate could not be verified.",
  probe_redirected_elsewhere:
    "That address redirected to a different host, which has no chat API — it looks like the provider's website rather than its API endpoint.",
  // The URL was right and the model was not — the endpoint's own model list says
  // so. Providers answer 404 for both, which is why this needed its own message.
  probe_bad_model:
    "The endpoint works, but it does not have that model. Check the exact model id — many providers namespace them, like nvidia/llama-3.3-nemotron-super-49b-v1.",
  probe_redirect_loop: "That URL redirects in a loop, or through too many hops.",
  probe_redirect_insecure:
    "That URL redirects to a plain http:// address, which would put your key on the wire unencrypted.",
  probe_blocked_target: "That address is inside this deployment, so it cannot be used.",
  probe_not_a_completion: "Something answered, but not with a completion — check the URL.",
  probe_unreachable: "The endpoint could not be reached.",
  extra_body_invalid: "extra_body is not valid JSON.",
  extra_body_not_object: "extra_body has to be a JSON object.",
  // The proxy's member-facing rejections. It answers these with codes rather than
  // prose precisely so they land here: "Something went wrong" for a plain-http
  // endpoint leaves someone with no idea what to change.
  provider_not_allowed:
    "That provider can't be registered here — only providers the connection test can actually verify.",
  model_required: "Name the model to use.",
  api_key_required: "An API key is required.",
  api_key_not_clearable: "Leave the key blank to keep the stored one — it can't be cleared.",
  api_key_required_new_endpoint: "Enter the API key again when you change the provider or the URL.",
  api_base_required: "The endpoint URL is required.",
  api_base_invalid: "That endpoint URL isn't valid.",
  api_base_not_https: "The endpoint URL has to start with https://.",
  api_base_has_query: "Use the plain endpoint URL, with no query string or #fragment.",
  user_models_cap: "You've reached the limit of models you can register. Delete one first.",
  user_model_duplicate: "You already have a model with that name.",
  user_model_invalid: "Something in that model definition isn't right.",
  user_model_disabled: "Your administrator disabled that model.",
  user_models_blocked: "Your administrator doesn't allow personal models here.",
  custom_endpoint_not_allowed:
    "Your administrator only allows the endpoints that come with the providers listed here. Ask them to enable custom endpoints if you need your own.",
  probe_too_soon: "Wait a moment before testing again.",
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
  project_name_taken: "Você já tem um projeto com esse nome.",
  projects_unsupported: "Este agente não suporta projetos.",
  native_is_admin_only: "Apenas um administrador pode alterar isso.",
  invalid_email: "Esse e-mail não parece válido.",
  invalid_code: "Código inválido. Tente de novo.",
  workspaces_load_failed: "Não foi possível carregar seus workspaces.",
  version_conflict: "Outro admin alterou este modelo — recarregue antes de salvar.",
  models_incomplete: "Preencha o nome do modelo, o provedor e o modelo.",
  gateway_retries_exhausted:
    "Ainda não foi possível falar com o gateway após várias tentativas. Tente daqui a pouco.",
  probe_bad_key: "O endpoint recusou essa chave de API.",
  probe_bad_endpoint:
    "Esse host respondeu, mas não há endpoint de chat nesse caminho — confira se a URL ainda tem o caminho da versão, ex.: /v1.",
  probe_rate_limited: "Seu provedor está limitando essa chave neste momento.",
  probe_provider_error: "O provedor respondeu com um erro dele. Tente mais tarde.",
  probe_timeout: "O endpoint não respondeu a tempo.",
  probe_dns: "Não foi possível resolver esse nome de host.",
  probe_tls: "Não foi possível verificar o certificado do endpoint.",
  probe_redirected_elsewhere:
    "Esse endereço redirecionou para outro host, que não tem API de chat — parece ser o site do provedor, não o endpoint da API.",
  probe_bad_model:
    "O endpoint funciona, mas não tem esse modelo. Confira o identificador exato — muitos provedores usam prefixo, como nvidia/llama-3.3-nemotron-super-49b-v1.",
  probe_redirect_loop: "Essa URL redireciona em loop, ou por saltos demais.",
  probe_redirect_insecure:
    "Essa URL redireciona para um endereço http:// puro, o que colocaria sua chave na rede sem criptografia.",
  probe_blocked_target: "Esse endereço está dentro desta instalação, então não pode ser usado.",
  probe_not_a_completion: "Algo respondeu, mas não foi uma completion — confira a URL.",
  probe_unreachable: "Não foi possível alcançar o endpoint.",
  extra_body_invalid: "extra_body não é um JSON válido.",
  extra_body_not_object: "extra_body precisa ser um objeto JSON.",
  provider_not_allowed:
    "Esse provedor não pode ser registrado aqui — só provedores que o teste de conexão consegue verificar de verdade.",
  model_required: "Informe qual modelo usar.",
  api_key_required: "É preciso informar uma chave de API.",
  api_key_not_clearable: "Deixe a chave em branco para manter a que já está salva — ela não pode ser apagada.",
  api_key_required_new_endpoint: "Informe a chave de API de novo ao trocar o provedor ou a URL.",
  api_base_required: "A URL do endpoint é obrigatória.",
  api_base_invalid: "Essa URL de endpoint não é válida.",
  api_base_not_https: "A URL do endpoint precisa começar com https://.",
  api_base_has_query: "Use a URL do endpoint sem query string nem #fragmento.",
  user_models_cap: "Você chegou ao limite de modelos que pode registrar. Exclua um antes.",
  user_model_duplicate: "Você já tem um modelo com esse nome.",
  user_model_invalid: "Algo na definição desse modelo não está certo.",
  user_model_disabled: "Seu administrador desativou esse modelo.",
  user_models_blocked: "Seu administrador não permite modelos próprios aqui.",
  custom_endpoint_not_allowed:
    "Seu administrador só permite os endpoints que vêm com os provedores listados aqui. Peça a ele para liberar endpoints próprios se precisar do seu.",
  probe_too_soon: "Espere um instante antes de testar de novo.",
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
