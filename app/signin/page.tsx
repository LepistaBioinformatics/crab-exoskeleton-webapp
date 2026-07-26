"use client";

import { useState, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BrandName from "@/app/brand-name";
import MyceliumBg from "@/components/landing/mycelium-bg";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { useT } from "@/lib/i18n/context";
import { signInCopy } from "@/lib/i18n/signin";
import styles from "@/components/landing/landing.module.css";

type Step = "email" | "code";

// A prominent 6-slot code mask: one real input drives entry (covering the
// grid), while the slots render each digit with a glowing active slot.
function CodeInput({
  value,
  onChange,
  length = 6,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const chars = value.split("");
  const t = useT(signInCopy);
  return (
    <div className={styles.codeWrap} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        className={styles.codeInputHidden}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        autoFocus={autoFocus}
        aria-label={t.codeAria}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
      />
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`${styles.codeSlot} ${chars[i] ? styles.codeSlotFilled : ""} ${
            i === value.length ? styles.codeSlotActive : ""
          }`}
        >
          {chars[i] ?? ""}
        </div>
      ))}
    </div>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const t = useT(signInCopy);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // The key, not the sentence: a locale switch while an error is on screen has
  // to re-render the message, and a stored string wouldn't.
  const [error, setError] = useState<"gatewayDown" | "invalidCode" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError("gatewayDown");
        return;
      }
      setStep("code");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (res.status === 401) {
        setError("invalidCode");
        return;
      }
      if (!res.ok) {
        setError("gatewayDown");
        return;
      }
      router.push("/chat");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MyceliumBg>
      <div className={styles.authScreen}>
        <div className={styles.authCard}>
          <div className="flex items-center justify-between gap-2">
            <Link href="/" className={styles.backLink}>
              <ArrowLeft size={14} aria-hidden />
              {t.back}
            </Link>
            {/* With START_AT_SIGNIN the landing is unreachable, so this is the
                only place a visitor can pick a language before signing in. */}
            <LanguageSwitcher />
          </div>
          <div className={styles.authHead}>
            <span className={styles.brandDot} aria-hidden />
            <div>
              <div className={styles.authTitle}>
                <BrandName /> {t.titleSuffix}
              </div>
              <div className={styles.authSub}>{t.subtitle}</div>
            </div>
          </div>

          {error && <div className={styles.authAlert}>{t[error]}</div>}

          {step === "email" && (
            <form className={styles.authForm} onSubmit={onSubmitEmail}>
              <div>
                <label htmlFor="email" className={styles.authLabel}>
                  {t.emailLabel}
                </label>
                <input
                  id="email"
                  type="email"
                  autoFocus
                  required
                  className={styles.authInput}
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className={`${styles.enter} ${styles.enterLg} ${styles.btnBlock}`}
              >
                {submitting ? t.sending : t.sendLink}
              </button>
            </form>
          )}

          {step === "code" && (
            <form className={styles.authForm} onSubmit={onSubmitCode}>
              <p className={styles.authText}>
                {t.checkMailBefore}
                <strong>{email}</strong>
                {t.checkMailAfter}
              </p>
              <div>
                <label className={styles.authLabel}>{t.codeLabel}</label>
                <CodeInput value={code} onChange={setCode} autoFocus />
              </div>
              <button
                type="submit"
                disabled={submitting || code.length < 6}
                className={`${styles.enter} ${styles.enterLg} ${styles.btnBlock}`}
              >
                {submitting ? t.verifying : t.verify}
              </button>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setStep("email");
                  setError(null);
                  setCode("");
                }}
              >
                {t.backToEmail}
              </button>
            </form>
          )}
        </div>
      </div>
    </MyceliumBg>
  );
}
