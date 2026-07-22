"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import BrandName from "@/app/brand-name";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale } from "@/lib/i18n/config";
import { landingCopy } from "@/lib/i18n/landing";
import styles from "./landing.module.css";
import {
  HeroArt,
  CanvasMini,
  TreeMini,
  InjectionFlow,
  ComponentMap,
  ComponentLegend,
  HierarchyTree,
  MemoryMock,
  FilesMock,
  TemplatesMock,
  NextIcon,
} from "./diagrams";

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function NextNudge({ href, label }: { href: string; label: string }) {
  const id = href.replace(/^#/, "");
  return (
    <a
      href={href}
      className={styles.next}
      onClick={(e) => {
        e.preventDefault();
        smoothScrollTo(id);
      }}
    >
      {label}
      <span className={styles.nextChevron} aria-hidden>
        <NextIcon size={24} />
      </span>
    </a>
  );
}

export default function Landing({ initialLocale }: { initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const t = landingCopy[locale];

  // Drive the bar's locale via setAttribute (not a JSX prop): React 19 sets
  // matching values as element *properties*, and <lbl-brand-bar> exposes
  // `locale` as a getter-only property, so a prop bind throws "setting
  // getter-only property". The attribute is what the component observes.
  useEffect(() => {
    barRef.current?.setAttribute("locale", locale === "pt" ? "pt-BR" : "en");
  }, [locale]);

  function chooseLocale(next: Locale) {
    setLocale(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  // The Lepista bar's own PT/EN toggle drives the app's language too: it emits
  // `lbl-locale-change` (en / pt-BR); map it onto our locale, switch the copy
  // live and persist the cookie. No loop — the bar's `locale` attribute is
  // derived from this same state, and re-setting it to the current value is a
  // no-op. (setLocale is stable, so the listener is attached once.)
  useEffect(() => {
    function onBarLocale(e: Event) {
      const raw = (e as CustomEvent<{ locale?: string }>).detail?.locale ?? "";
      const next: Locale = raw.toLowerCase().startsWith("pt") ? "pt" : "en";
      setLocale(next);
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    }
    document.addEventListener("lbl-locale-change", onBarLocale);
    return () => document.removeEventListener("lbl-locale-change", onBarLocale);
  }, []);

  // Scroll reveal, armed only with JS. To avoid a flash, elements already in
  // view are marked revealed synchronously before the hiding `js` class lands;
  // the observer handles the rest as they scroll in.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const vh = window.innerHeight;
    for (const el of items) {
      if (el.getBoundingClientRect().top < vh * 0.9) el.classList.add(styles.in);
    }
    root.classList.add(styles.js);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add(styles.in);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    for (const el of items) if (!el.classList.contains(styles.in)) io.observe(el);
    return () => io.disconnect();
  }, [locale]);

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.field} aria-hidden />

      <header className={styles.topbar}>
        <span className={styles.brand}>
          <span className={styles.brandDot} aria-hidden />
          <BrandName />
        </span>
        <div className={styles.topActions}>
          <div className={styles.langWrap} role="group" aria-label={t.top.language}>
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                className={`${styles.langBtn} ${l === locale ? styles.langActive : ""}`}
                aria-pressed={l === locale}
                onClick={() => chooseLocale(l)}
              >
                {l === "en" ? "EN" : l.toUpperCase()}
                <span className="sr-only"> — {LOCALE_NAMES[l]}</span>
              </button>
            ))}
          </div>
          <Link href="/signin" className={styles.enter}>
            {t.top.enter}
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        {/* HERO */}
        <section className={styles.hero} id="hero">
          <div>
            <span className={styles.eyebrow}>{t.hero.eyebrow}</span>
            <h1 className={styles.heroTitle}>{t.hero.title}</h1>
            <p className={styles.heroLead}>{t.hero.lead}</p>
            <div className={styles.heroCtas}>
              <Link href="/signin" className={`${styles.enter} ${styles.enterLg}`}>
                {t.hero.cta}
              </Link>
              <a
                href="#s1"
                className={styles.scrollHint}
                onClick={(e) => {
                  e.preventDefault();
                  smoothScrollTo("s1");
                }}
              >
                {t.hero.scrollHint}
                <NextIcon size={18} aria-hidden />
              </a>
            </div>
          </div>
          <div className={styles.artCol}>
            <HeroArt />
          </div>
        </section>

        {/* 01 — thought lines */}
        <section className={styles.section} id="s1">
          <div className={`${styles.grid} ${styles.gridWide}`}>
            <div className={styles.copyCol} data-reveal>
              <span className={styles.eyebrow}>
                <span className={styles.idx}>{t.thought.index}</span> {t.thought.eyebrow}
              </span>
              <h2 className={styles.title}>{t.thought.title}</h2>
              <p className={styles.body}>{t.thought.body}</p>
              <NextNudge href="#s2" label={t.thought.next} />
            </div>
            <div className={styles.artCol} data-reveal>
              <div className={styles.panel}>
                <CanvasMini />
                <div className={styles.panelCaption}>{t.thought.canvasCaption}</div>
              </div>
              <div style={{ height: "1rem" }} />
              <div className={styles.panel}>
                <TreeMini />
                <div className={styles.panelCaption}>{t.thought.treeCaption}</div>
              </div>
            </div>
          </div>
        </section>

        {/* 02 — memory */}
        <section className={styles.section} id="s2">
          <div className={`${styles.grid} ${styles.flip}`}>
            <div className={styles.copyCol} data-reveal>
              <span className={styles.eyebrow}>
                <span className={styles.idx}>{t.memory.index}</span> {t.memory.eyebrow}
              </span>
              <h2 className={styles.title}>{t.memory.title}</h2>
              <p className={styles.body}>{t.memory.body}</p>
              <NextNudge href="#s3" label={t.memory.next} />
            </div>
            <div className={styles.artCol} data-reveal>
              <div className={styles.panel}>
                <MemoryMock dict={t.memory} />
              </div>
            </div>
          </div>
        </section>

        {/* 03 — isolation & secrets */}
        <section className={styles.section} id="s3">
          <div className={styles.grid}>
            <div className={styles.copyCol} data-reveal>
              <span className={styles.eyebrow}>
                <span className={styles.idx}>{t.isolation.index}</span> {t.isolation.eyebrow}
              </span>
              <h2 className={styles.title}>{t.isolation.title}</h2>
              <p className={styles.body}>{t.isolation.body}</p>
              <ul className={styles.points}>
                {t.isolation.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <NextNudge href="#s4" label={t.isolation.next} />
            </div>
            <div className={styles.artCol} data-reveal>
              <div className={styles.panel}>
                <InjectionFlow dict={t.isolation} />
              </div>
            </div>
          </div>
        </section>

        {/* 04 — defense in depth (component map) */}
        <section className={styles.section} id="s4">
          <div className={`${styles.grid} ${styles.flip}`}>
            <div className={styles.copyCol} data-reveal>
              <span className={styles.eyebrow}>
                <span className={styles.idx}>{t.defense.index}</span> {t.defense.eyebrow}
              </span>
              <h2 className={styles.title}>{t.defense.title}</h2>
              <p className={styles.body}>{t.defense.body}</p>
              <NextNudge href="#s5" label={t.defense.next} />
            </div>
            <div className={styles.artCol} data-reveal>
              <div className={styles.panel}>
                <ComponentMap doorLabel={t.defense.doorLabel} />
                <ComponentLegend groups={t.defense.groups} />
                <div className={styles.panelCaption}>{t.defense.caption}</div>
              </div>
            </div>
          </div>
        </section>

        {/* 05 — hierarchy */}
        <section className={styles.section} id="s5">
          <div className={styles.grid}>
            <div className={styles.copyCol} data-reveal>
              <span className={styles.eyebrow}>
                <span className={styles.idx}>{t.hierarchy.index}</span> {t.hierarchy.eyebrow}
              </span>
              <h2 className={styles.title}>{t.hierarchy.title}</h2>
              <p className={styles.body}>{t.hierarchy.body}</p>
              <NextNudge href="#s6" label={t.hierarchy.next} />
            </div>
            <div className={styles.artCol} data-reveal>
              <div className={styles.panel}>
                <HierarchyTree dict={t.hierarchy} />
              </div>
            </div>
          </div>
        </section>

        {/* 06 — agent templates */}
        <section className={styles.section} id="s6">
          <div className={`${styles.grid} ${styles.flip}`}>
            <div className={styles.copyCol} data-reveal>
              <span className={styles.eyebrow}>
                <span className={styles.idx}>{t.templates.index}</span> {t.templates.eyebrow}
              </span>
              <h2 className={styles.title}>{t.templates.title}</h2>
              <p className={styles.body}>{t.templates.body}</p>
              <ul className={styles.points}>
                {t.templates.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <NextNudge href="#s7" label={t.templates.next} />
            </div>
            <div className={styles.artCol} data-reveal>
              <div className={styles.panel}>
                <TemplatesMock dict={t.hierarchy} />
              </div>
            </div>
          </div>
        </section>

        {/* 07 — files */}
        <section className={styles.section} id="s7">
          <div className={styles.grid}>
            <div className={styles.copyCol} data-reveal>
              <span className={styles.eyebrow}>
                <span className={styles.idx}>{t.files.index}</span> {t.files.eyebrow}
              </span>
              <h2 className={styles.title}>{t.files.title}</h2>
              <p className={styles.body}>{t.files.body}</p>
              <NextNudge href="#cta" label={t.files.next} />
            </div>
            <div className={styles.artCol} data-reveal>
              <div className={styles.panel}>
                <FilesMock dict={t.files} />
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.cta} id="cta" data-reveal>
          <span className={styles.eyebrow}>{t.cta.eyebrow}</span>
          <h2 className={styles.ctaTitle}>{t.cta.title}</h2>
          <p className={styles.body} style={{ margin: "0 auto 2rem" }}>
            {t.cta.body}
          </p>
          <Link href="/signin" className={`${styles.enter} ${styles.enterLg}`}>
            {t.cta.button}
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>{t.cta.footnote}</footer>

      {/* Lepista Brand Bar (Shadow-DOM web component) — landing only, pinned to
          the very bottom as a footer. Its locale follows the page's. */}
      <Script src="https://lepista.com.br/embed/lbl-bar.v1.js" strategy="afterInteractive" />
      <lbl-brand-bar ref={barRef} className={styles.brandBarFooter} style={{ minHeight: "48px" }} />
    </div>
  );
}
