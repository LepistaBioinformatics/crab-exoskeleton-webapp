"use client";

import { useState, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BrandName from "@/app/brand-name";
import MyceliumBg from "@/components/landing/mycelium-bg";
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
        aria-label="Verification code"
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
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
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
        setError("Could not reach the gateway. Is the stack running?");
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
        setError("Invalid code. Try again.");
        return;
      }
      if (!res.ok) {
        setError("Could not reach the gateway. Is the stack running?");
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
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={14} aria-hidden />
            Back to home
          </Link>
          <div className={styles.authHead}>
            <span className={styles.brandDot} aria-hidden />
            <div>
              <div className={styles.authTitle}>
                <BrandName /> chat
              </div>
              <div className={styles.authSub}>Sign in with your email — no password needed.</div>
            </div>
          </div>

          {error && <div className={styles.authAlert}>{error}</div>}

          {step === "email" && (
            <form className={styles.authForm} onSubmit={onSubmitEmail}>
              <div>
                <label htmlFor="email" className={styles.authLabel}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoFocus
                  required
                  className={styles.authInput}
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className={`${styles.enter} ${styles.enterLg} ${styles.btnBlock}`}
              >
                {submitting ? "Sending…" : "Send magic link"}
              </button>
            </form>
          )}

          {step === "code" && (
            <form className={styles.authForm} onSubmit={onSubmitCode}>
              <p className={styles.authText}>
                Check <strong>{email}</strong> for a link, open it, and enter the 6-digit code it
                shows.
              </p>
              <div>
                <label className={styles.authLabel}>Code</label>
                <CodeInput value={code} onChange={setCode} autoFocus />
              </div>
              <button
                type="submit"
                disabled={submitting || code.length < 6}
                className={`${styles.enter} ${styles.enterLg} ${styles.btnBlock}`}
              >
                {submitting ? "Verifying…" : "Verify"}
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
                ← Back
              </button>
            </form>
          )}
        </div>
      </div>
    </MyceliumBg>
  );
}
