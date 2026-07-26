import { cva } from "class-variance-authority";

// The admin screen's field primitive. Every labelled control in every tab goes
// through it, so the three-part rhythm is the same everywhere:
//
//   label        — names the task in the admin's words, and always stays visible
//   job          — one line saying what the field does
//   consequence  — one line saying what THIS value causes, only when it causes
//                  something
//
// The rhythm exists because the panels previously labelled fields with
// placeholders, which vanish the moment someone types — so a half-filled form
// stopped saying which field was which. Placeholders now hold examples only.
//
// `identifier` sets the control in mono. That is the screen's one load-bearing
// type rule: a value in mono lands in a config file verbatim, a value in sans was
// written for a person. It answers "is this a real identifier?" at a glance,
// which is most of what made the model form hard to read.

const control = cva(
  "w-full rounded-md border border-brand/40 bg-bg px-2.5 py-2 text-fg placeholder:text-fg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
  {
    variants: {
      identifier: {
        true: "font-mono text-[12.5px]",
        false: "font-sans text-[13px]",
      },
    },
    defaultVariants: { identifier: false },
  },
);

export function fieldControlClass(identifier = false): string {
  return control({ identifier });
}

export function Field({
  label,
  job,
  htmlFor,
  consequence,
  children,
}: {
  label: string;
  /** One line on what the field does. Omit only when the label is self-evident. */
  job?: string;
  htmlFor?: string;
  /**
   * What this value causes. Rendered against an accent rule so it reads as an
   * effect rather than more instruction — and placed with the field, never
   * collected into a paragraph at the foot of the form where nobody connects it
   * back to the control that caused it.
   */
  consequence?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-fg" htmlFor={htmlFor}>
        {label}
      </label>
      {job && <span className="text-xs text-fg-muted">{job}</span>}
      {children}
      {consequence && (
        <p className="mt-0.5 flex items-stretch gap-2 text-xs text-fg-muted">
          <span aria-hidden className="w-0.5 shrink-0 rounded-sm bg-accent" />
          <span>{consequence}</span>
        </p>
      )}
    </div>
  );
}

// A group of fields under a heading. The eyebrow is display-face, tracked and
// uppercase — reserved for group headings and never used on a field label, so the
// two never compete for the same reading.
export function FieldGroup({
  title,
  intro,
  count,
  children,
}: {
  title: string;
  intro?: string;
  /** A short right-aligned fact about the group, e.g. "5 levels". */
  count?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 border-b border-brand/25 pb-1.5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-fg">
          {title}
        </span>
        {count && <span className="ml-auto text-[11.5px] text-fg-muted">{count}</span>}
      </div>
      {intro && <p className="-mt-1 max-w-[62ch] text-xs text-fg-muted">{intro}</p>}
      {children}
    </section>
  );
}

// An identifier rendered inline in running text — a model name, an api_base, a
// slot path. Same rule as `identifier` above, applied to prose.
export function Ident({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.92em]">{children}</span>;
}
