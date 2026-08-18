"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";

// THE ONLY ENTRY POINT to the admin screen — nothing else in the app links to /admin.
// That is what makes this gate load-bearing rather than cosmetic: a caller it hides the
// link from cannot reach the screen at all except by typing the URL.
//
// It probes BOTH authorities, because /admin has two independent halves. Scopes decide
// the workspace sections; branding is instance-wide and needs no scope, so a staff or
// manager caller can administer it while managing no tenant at all.
//
// Probing only the scopes — which is what this did — hid the link from exactly that
// caller: branding rights, an admin screen with something on it for them, and no way in.
// Reported as "I'm staff and the admin button doesn't show".
//
// A member with neither authority still never sees it. The proxy and the branding writes
// are the real gates (NFR-1); this is visibility.
export default function AdminLink() {
  const t = useT(chatCopy);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (!cancelled) setShow(true);
    };
    // Two probes, not one chained after the other: either answer on its own is enough,
    // so neither should wait on the other, and a failure of one must not suppress the
    // other's answer. Both fail closed — an unreachable probe leaves the link hidden
    // rather than offering a screen the caller may not be able to use.
    fetch("/api/admin/scopes")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.scopes) && data.scopes.length > 0) reveal();
      })
      .catch(() => {});
    fetch("/api/branding/can-edit")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.canEdit) reveal();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <Link
      href="/admin"
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-elevated/60 hover:text-fg"
    >
      <ShieldCheck size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{t.adminLink.label}</span>
    </Link>
  );
}
