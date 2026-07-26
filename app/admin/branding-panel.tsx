"use client";

import { useEffect, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { RotateCcw, Save, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCode } from "@/lib/i18n/errors";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

type Variant = "light" | "dark" | "icon";

const preview = cva("h-16 w-16 rounded-lg border border-brand/30 object-contain", {
  variants: {
    tone: {
      light: "bg-white",
      dark: "bg-neutral-900",
      icon: "bg-neutral-900",
    },
  },
});

const LABEL_KEY: Record<Variant, "lightLogo" | "darkLogo" | "appIcon"> = {
  light: "lightLogo",
  dark: "darkLogo",
  icon: "appIcon",
};

// Instance branding admin panel (FR-10): edit the app name and upload / reset
// the light and dark logos. Server-side authz is the real gate; this panel is
// only reachable when /api/branding/can-edit is true.
export default function BrandingPanel() {
  const t = useT(adminCopy);
  const c = useT(commonCopy);
  const err = useT(errorCopy);
  const [appName, setAppName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bust, setBust] = useState(() => Date.now());
  const [busy, setBusy] = useState<Variant | null>(null);
  const [pendingLogoReset, setPendingLogoReset] = useState<Variant | null>(null);
  const [pendingNameReset, setPendingNameReset] = useState(false);
  const lightInput = useRef<HTMLInputElement>(null);
  const darkInput = useRef<HTMLInputElement>(null);
  const iconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.appName) setAppName(data.appName as string);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function refreshPreviews() {
    setBust(Date.now());
  }

  async function saveName(name: string, resetting: boolean) {
    setSavingName(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: name }),
      });
      if (!res.ok) throw new Error(await errorCode(res));
      const data = await res.json();
      setAppName((data?.appName as string) ?? "");
      setNotice(resetting ? t.branding.nameReset : t.branding.nameSaved);
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setSavingName(false);
    }
  }

  async function uploadLogo(variant: Variant, file: File) {
    setBusy(variant);
    setError(null);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/branding/logo/${variant}`, { method: "POST", body });
      if (!res.ok) throw new Error(await errorCode(res));
      refreshPreviews();
      setNotice(t.branding.logoUpdated.replace("{label}", t.branding[LABEL_KEY[variant]]));
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setBusy(null);
      for (const ref of [lightInput, darkInput, iconInput]) {
        if (ref.current) ref.current.value = "";
      }
    }
  }

  async function resetLogo(variant: Variant) {
    setPendingLogoReset(null);
    setBusy(variant);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/branding/logo/${variant}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorCode(res));
      refreshPreviews();
      setNotice(t.branding.logoReset.replace("{label}", t.branding[LABEL_KEY[variant]]));
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  const variants: { key: Variant; label: string; ref: React.RefObject<HTMLInputElement | null> }[] = [
    { key: "light", label: t.branding.lightLogo, ref: lightInput },
    { key: "dark", label: t.branding.darkLogo, ref: darkInput },
    { key: "icon", label: t.branding.appIcon, ref: iconInput },
  ];

  return (
    <div className="flex max-w-xl flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-semibold text-fg">{t.branding.appNameHeading}</h2>
        <p className="text-xs text-fg-muted">{t.branding.appNameIntro}</p>
        <div className="flex items-center gap-2">
          <Input
            value={appName}
            placeholder="zombie-crab"
            onChange={(e) => setAppName(e.target.value)}
            disabled={savingName}
          />
          <Button
            variant="filled"
            size="sm"
            disabled={savingName}
            onClick={() => saveName(appName, false)}
          >
            <Save size={16} aria-hidden />
            {c.actions.save}
          </Button>
          <Button
            variant="outlined"
            size="sm"
            disabled={savingName}
            onClick={() => setPendingNameReset(true)}
          >
            <RotateCcw size={16} aria-hidden />
            {c.actions.reset}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-fg">{t.branding.logosHeading}</h2>
        <p className="text-xs text-fg-muted">{t.branding.logosIntro}</p>
        <p className="text-xs text-fg-muted">
          {t.branding.iconNoteBefore}
          <strong className="text-fg">{t.branding.iconNoteAppIcon}</strong>
          {t.branding.iconNoteMiddle}
          <strong className="text-fg">{t.branding.iconNoteSquare}</strong>
          {t.branding.iconNoteAfter}
        </p>
        {variants.map((v) => (
          <div
            key={v.key}
            className="flex items-center gap-4 rounded-lg border border-brand/30 bg-elevated px-3 py-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/branding/logo/${v.key}?t=${bust}`}
              alt={`${v.label} ${t.branding.previewSuffix}`}
              className={preview({ tone: v.key })}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{v.label}</p>
              <input
                ref={v.ref}
                type="file"
                accept={
                  v.key === "icon"
                    ? "image/png,image/webp"
                    : "image/png,image/jpeg,image/webp,image/svg+xml"
                }
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(v.key, f);
                }}
              />
            </div>
            <Button
              variant="tonal"
              size="sm"
              disabled={busy === v.key}
              onClick={() => v.ref.current?.click()}
            >
              <Upload size={16} aria-hidden />
              {busy === v.key ? t.branding.working : t.branding.upload}
            </Button>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={`${t.branding.resetPrefix} ${v.label} ${t.branding.resetSuffix}`}
              title={t.branding.resetToDefault}
              disabled={busy === v.key}
              onClick={() => setPendingLogoReset(v.key)}
            >
              <RotateCcw size={16} aria-hidden />
            </IconButton>
          </div>
        ))}
      </section>

      <ConfirmDialog
        open={pendingNameReset}
        title={t.branding.resetNameTitle}
        message={t.branding.resetNameMessage}
        confirmLabel={c.actions.reset}
        onConfirm={() => {
          setPendingNameReset(false);
          saveName("", true);
        }}
        onCancel={() => setPendingNameReset(false)}
      />

      <ConfirmDialog
        open={pendingLogoReset !== null}
        title={t.branding.resetLogoTitle}
        message={t.branding.resetLogoMessage}
        confirmLabel={c.actions.reset}
        onConfirm={() => pendingLogoReset && resetLogo(pendingLogoReset)}
        onCancel={() => setPendingLogoReset(null)}
      />
    </div>
  );
}


