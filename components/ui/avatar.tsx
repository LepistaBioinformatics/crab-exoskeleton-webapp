import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

// Small rounded-square identity marker. Shows the tenant brand logo when
// present, otherwise initials on a brand/derived color. Sized to sit in the
// footprint of the tree icons it replaces, so the sidebar layout is unchanged.
const avatar = cva(
  "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-[5px]",
  {
    variants: {
      size: {
        sm: "h-[18px] w-[18px] text-[9px]",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export interface TenantAvatarProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">,
    VariantProps<typeof avatar> {
  name: string;
  logo?: string | null;
  color?: string | null;
}

export function TenantAvatar({ name, logo, color, size, className, ...props }: TenantAvatarProps) {
  if (logo) {
    // object-contain (not cover) so wide wordmarks aren't cropped to a few
    // center letters, matching mycelium's own BrandCard. The white tile keeps
    // transparent logos legible against the sidebar surface in both themes.
    return (
      <span className={cn(avatar({ size }), "bg-white p-[1px]", className)} {...props}>
        <img src={logo} alt={`${name} logo`} className="h-full w-full object-contain" />
      </span>
    );
  }

  const bg = HEX_COLOR_PATTERN.test(color ?? "") ? color! : hashColor(name);

  return (
    <span
      className={cn(avatar({ size }), "font-semibold", className)}
      style={{ backgroundColor: bg, color: textColor(bg) }}
      aria-hidden
      {...props}
    >
      {initials(name)}
    </span>
  );
}

// First letter of the first two words, or first two letters of a single word.
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Deterministic saturated color from the name, used when the tenant has no
// brand primaryColor. Fixed lightness keeps white text legible.
function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

// Pick black/white text for adequate contrast. Only hex is measured; the
// generated hsl above is dark enough to always take white.
function textColor(bg: string): string {
  if (!HEX_COLOR_PATTERN.test(bg)) return "#fff";
  let hex = bg.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000" : "#fff";
}
