import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

const alert = cva("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", {
  variants: {
    severity: {
      error: "border-red-500/50 bg-red-500/10 text-fg",
      // Nothing is broken and nothing failed -- something the member set up is
      // not doing what they think it is doing. Neither of the other two says
      // that.
      warning: "border-amber-500/50 bg-amber-500/10 text-fg",
      // The odd one out, and knowingly. The other two borders are severity HUES at a
      // matched weight; `info` has no hue of its own, so it was the brand violet and is
      // now the divider grammar's strong rule. That makes it 40% where its siblings are
      // 50% -- a deliberate cost of having exactly two named hairlines instead of six,
      // not an oversight. If the three ever need to match again, the fix is a severity
      // token for `info`, NOT a third opacity of the rule.
      info: "border-rule-strong bg-accent/10 text-fg",
    },
  },
  defaultVariants: { severity: "info" },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alert> {}

export function Alert({ className, severity = "info", children, ...props }: AlertProps) {
  const Icon = severity === "error" ? CircleAlert : severity === "warning" ? TriangleAlert : Info;
  return (
    <div role="alert" className={cn(alert({ severity }), className)} {...props}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
