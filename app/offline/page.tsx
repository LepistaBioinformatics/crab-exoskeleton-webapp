import { getLocale } from "@/lib/i18n/server";
import { offlineCopy } from "@/lib/i18n/offline";
import OfflineCard from "./offline-card";

// Offline fallback served by the service worker when a navigation fails. It
// relies only on precached, bundled assets (no /api/* calls) so it renders
// without the network -- the bundled logo is used directly rather than the
// branding endpoint.
export async function generateMetadata() {
  return { title: offlineCopy[await getLocale()].metaTitle };
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <OfflineCard />
    </div>
  );
}
