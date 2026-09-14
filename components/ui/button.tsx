import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// M3-structured button: an `::after` overlay is the Material state layer
// (accent/current tint on hover/press) replacing MUI's ripple; the focus ring
// is the accessibility floor. `shadow: signature` opts into the Lepista
// hard-offset shadow + lift, reserved for /signin.

// The state layer, and the weight, LIVE IN THE VARIANTS rather than in the base.
//
// They were in the base, which was right while every variant was a button-shaped
// button. `link` is not: it is a control set in the same delicate type the sidebar's
// rows and the tasks panel's back control already use, and it wants neither a tint
// overlay nor `font-semibold`.
//
// Turning them off from the base would not have worked, and the reason is the hazard
// `resizable-pane.test.ts` records: two utilities of the same property on one element are
// resolved by the order Tailwind EMITS them, not by the order they appear in the class
// string — so `font-medium` after `font-semibold` is a coin toss the build does not
// report. Mutually exclusive values are the only shape that cannot go wrong.
const STATE_LAYER =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-current after:opacity-0 after:transition-opacity hover:after:opacity-10 active:after:opacity-20";

const button = cva(
  [
    "relative isolate inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-sans",
    "transition-[transform,box-shadow,opacity,color] select-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:opacity-50 disabled:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        filled: `border border-brand bg-accent text-accent-fg font-semibold ${STATE_LAYER}`,
        outlined: `border border-brand bg-transparent text-fg font-semibold ${STATE_LAYER}`,
        text: `bg-transparent text-fg font-semibold ${STATE_LAYER}`,
        tonal: `border border-rule-strong bg-elevated text-fg font-semibold ${STATE_LAYER}`,
        // A control that reads as a LINK, in the type this app already speaks it in:
        // the sidebar's destination rows and the tasks panel's back control are
        // `text-fg-muted hover:text-fg` at `font-medium`, and this is that idiom given
        // a name so the next component does not spell it a fourth way.
        //
        // No border and no state layer: a bordered box around a two-word action was
        // what made the files row read as heavier than the file list under it. The
        // underline arrives on hover, which is the one thing Bootstrap's `btn-link`
        // gets right — the affordance appears when the pointer asks for it.
        link: "bg-transparent font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        // The `link` variant's own size. It keeps the 32px hit target — nothing about
        // reading lighter should make a control harder to hit, least of all on a phone —
        // and drops to the padding of a text control so it lines up with the list below
        // it instead of sitting inset from it.
        link: "h-8 px-2 text-sm",
      },
      shadow: {
        none: "",
        signature:
          "shadow-[4px_4px_0_0_var(--accent-soft)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--accent-soft)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_0_var(--accent-soft)]",
      },
    },
    defaultVariants: { variant: "filled", size: "md", shadow: "none" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shadow, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(button({ variant, size, shadow }), className)} {...props} />
  ),
);
Button.displayName = "Button";
