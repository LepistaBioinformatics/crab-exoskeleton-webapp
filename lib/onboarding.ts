import { myceliumRpc, MyceliumConnectivityError } from "@/lib/mycelium";

// Server-side only. Detects whether the signed-in user already has a mycelium
// account, mirroring the reference mycelium-webapp Onboarding: profileGet() then
// accountsGet(), over JSON-RPC (/_adm/rpc). The internal (magic-link) account
// endpoints only work via RPC (the REST ones are external-provider-only).
// `beginners.accounts.get` returns the account object or null — a non-null
// result means the user has an account (verified empirically for a magic-link
// user; no invitation needed). A transport failure stays distinct from
// account-less: never route to onboarding because the gateway was unreachable.
// So does a rejected token: `myceliumRpc` resolves non-2xx instead of throwing,
// so an expired session used to look exactly like "no account" and pushed the
// user into onboarding instead of back to sign-in. 401 is the status the
// gateway returns for a rejected bearer token everywhere else in this app (see
// the /api/chat handlers); an expiry reported as a JSON-RPC error envelope
// would arrive as status 400 and is *not* covered here.
export type AccountStatus = "yes" | "no" | "expired" | "unreachable";

export async function hasAccount(token: string): Promise<AccountStatus> {
  try {
    // Mirror the reference ordering; the account is the decisive signal. The
    // profile result stays deliberately unread, 401 included: a user who has no
    // account yet has no profile either, and mycelium's status for that case is
    // unverified here — classifying it as expired would send every brand-new
    // user to sign-in instead of onboarding. An expired token fails both calls,
    // so accounts.get alone is enough to catch it.
    await myceliumRpc("beginners.profile.get", { withUrl: false }, token);

    const acc = await myceliumRpc<unknown>("beginners.accounts.get", {}, token);
    if (!acc.ok) return acc.status === 401 ? "expired" : "no";
    return acc.result ? "yes" : "no";
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) return "unreachable";
    return "no";
  }
}
