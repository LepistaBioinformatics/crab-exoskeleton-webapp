// Which sign-in step renders lives in the URL, not in component state, so a
// reload on the code form stays on the code form. Same rule the admin screen
// applies to `?tab=` (app/admin/tabs.ts): the URL is the single source of truth.
// Kept in its own module because the form itself needs a router context and so
// cannot be unit-tested in this suite's `environment: "node"`.

export const STEP_PARAM = "step";
export const EMAIL_PARAM = "email";

export type Step = "email" | "code";

export interface SignInLocation {
  step: Step;
  /** The address the code was sent to; empty on the e-mail step. */
  email: string;
}

// `?step=code` is honoured only with an address to verify against:
// /api/auth/verify takes { email, code }, so a hand-edited or truncated URL
// resolves to the e-mail form rather than to a form that cannot submit.
export function resolveLocation(step: string | null, email: string | null): SignInLocation {
  const address = email?.trim() ?? "";
  return step === "code" && address ? { step: "code", email: address } : { step: "email", email: address };
}

// Rebuilds the query from what is already on the URL instead of replacing it, so
// an unrelated key survives a step transition. The union (rather than an optional
// email) is what keeps a `step=code` URL from ever being built without one.
export function signInUrl(
  current: string,
  next: { step: "code"; email: string } | { step: "email" },
): string {
  const params = new URLSearchParams(current);
  if (next.step === "code") {
    params.set(STEP_PARAM, "code");
    params.set(EMAIL_PARAM, next.email);
  } else {
    params.delete(STEP_PARAM);
    params.delete(EMAIL_PARAM);
  }
  const query = params.toString();
  return query ? `/signin?${query}` : "/signin";
}
