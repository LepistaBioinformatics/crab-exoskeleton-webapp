"use client";

import { useRouter } from "next/navigation";
import Logo from "@/app/logo";
import { Surface } from "@/components/ui/surface";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";
import { commonCopy } from "@/lib/i18n/common";

// Shown when account detection can't reach the gateway at all -- distinct from
// an account-less user (who is routed to onboarding). We never treat a transport
// failure as "no account" (onboarding design.md R4).
export default function ConnectivityError() {
  const router = useRouter();
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <Surface bordered className="w-[440px] max-w-full p-8">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <h1 className="font-display text-xl font-semibold text-fg">{t.connectivity.title}</h1>
          </div>
          <Alert severity="error">{t.connectivity.body}</Alert>
          <Button type="button" variant="filled" onClick={() => router.refresh()}>
            {c.actions.retry}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
