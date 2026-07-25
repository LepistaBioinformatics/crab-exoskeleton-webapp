import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdminScreen from "./admin-screen";

// /admin -- the administrative screen (FR-9). Only a valid session is required
// to render; the actual manage authority is resolved client-side from
// GET /api/admin/scopes and, definitively, enforced server-side in the proxy
// (NFR-1). A caller with no manageable scopes sees an empty-state, not chrome.
//
// The Suspense boundary is what `useSearchParams` (the `?tab=` state) needs to
// stay safe if this route is ever prerendered: without one, Next fails the build
// with a CSR-bailout error rather than at runtime.
export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/signin");
  return (
    <Suspense>
      <AdminScreen />
    </Suspense>
  );
}
