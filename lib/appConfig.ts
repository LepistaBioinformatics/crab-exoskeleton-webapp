// Deployment-time switches read from the environment at request time (never
// baked into the build), so one image serves every deployment. Server-only: no
// NEXT_PUBLIC_ prefix, matching DATABASE_URL / MYCELIUM_INTERNAL_URL.

// Truthy spellings accepted for a boolean env var. Anything else — including
// unset, "0", "false", "no" — is off.
const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function isEnvEnabled(raw: string | undefined): boolean {
  return raw !== undefined && TRUTHY.has(raw.trim().toLowerCase());
}

// START_AT_SIGNIN makes `/` go straight to the sign-in screen instead of
// rendering the pre-auth landing page. Deployments that run this stack under
// their own brand want no zombie-crab marketing surface at all — the landing is
// mounted only from `/`, so the redirect makes it unreachable, including the
// Lepista brand bar it embeds. Pairs with the branding (name + logo) settings.
export function startAtSignin(): boolean {
  return isEnvEnabled(process.env.START_AT_SIGNIN);
}
