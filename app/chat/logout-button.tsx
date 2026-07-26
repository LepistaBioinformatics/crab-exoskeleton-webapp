"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";

export default function LogoutButton() {
  const router = useRouter();
  const t = useT(chatCopy);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/signin");
  }

  return (
    <>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t.logout.action}
        title={t.logout.action}
        onClick={() => setOpen(true)}
      >
        <LogOut size={18} aria-hidden />
      </IconButton>
      <ConfirmDialog
        open={open}
        title={t.logout.confirmTitle}
        message={t.logout.confirmMessage}
        confirmLabel={loading ? t.logout.pending : t.logout.action}
        onConfirm={onLogout}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
