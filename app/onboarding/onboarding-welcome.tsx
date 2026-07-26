"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/app/logo";
import BrandName from "@/app/brand-name";
import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/context";
import { onboardingCopy } from "@/lib/i18n/onboarding";
import { errorCopy, errorText } from "@/lib/i18n/errors";

export default function OnboardingWelcome({ email }: { email: string }) {
  const router = useRouter();
  const t = useT(onboardingCopy);
  const err = useT(errorCopy);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onStart() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(errorText(err, data?.error));
        return;
      }
      router.push("/chat");
    } catch {
      setError(t.failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <Surface bordered shadow="signature" className="w-[440px] max-w-full p-8">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <h1 className="font-display text-xl font-semibold text-fg">
                {t.welcomePrefix} <BrandName />
              </h1>
              <p className="text-sm text-fg-muted">{email}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg">
            <p>
              {t.leadBefore}
              <strong>{t.start}</strong>
              {t.leadAfter}
            </p>
            <p className="text-fg-muted">
              {t.hintTitle} {t.hint}
            </p>
          </div>

          {error && <Alert severity="error">{error}</Alert>}

          <Button
            type="button"
            variant="filled"
            shadow="signature"
            disabled={submitting}
            onClick={onStart}
          >
            {submitting ? t.creating : t.start}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
