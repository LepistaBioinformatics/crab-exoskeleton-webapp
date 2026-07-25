import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isInstanceAdmin } from "@/lib/instanceAdmin";
import { getLogo, setLogo, clearLogo, type BrandImage } from "@/lib/db";

// Uploaded logos are served as-is (no image processing), so only these
// browser-safe raster/vector image types are accepted; anything else is 400.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

// The PWA app icon is stricter: it must be a square raster a browser can decode
// as a maskable icon. SVG is rejected (inconsistent maskable support) and JPEG is
// rejected (no alpha, and its artefacts show badly at 48px). Squareness itself
// cannot be enforced without an image decoder, which this service deliberately
// does not depend on — the admin UI states the requirement instead.
const ICON_TYPES = new Set(["image/png", "image/webp"]);

const MAX_BYTES = 1024 * 1024; // ~1MB cap; large uploads are rejected 400.

// The bundled fallback for each variant, served as real bytes with a 200. This
// endpoint used to 302 to the static file when unset, which put a redirect in the
// middle of every manifest-icon fetch (pwa-installability).
const DEFAULTS: Record<BrandImage, { file: string; type: string }> = {
  light: { file: "logo-light.jpg", type: "image/jpeg" },
  dark: { file: "logo-dark.jpg", type: "image/jpeg" },
  icon: { file: "icon-512.png", type: "image/png" },
};

function parseVariant(raw: string): BrandImage | null {
  return raw === "light" || raw === "dark" || raw === "icon" ? raw : null;
}

// Public. Serves the custom image bytes, or the bundled default's bytes — always
// a 200, never a redirect. Cache-Control no-cache so a rebrand shows quickly.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ variant: string }> },
) {
  const variant = parseVariant((await params).variant);
  if (!variant) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // A DB blip must not take the icons down with it: fall through to the bundled
  // default rather than 500ing, or an installed PWA loses its icon.
  const logo = await getLogo(variant).catch(() => null);
  if (logo) {
    return new NextResponse(new Uint8Array(logo.bytes), {
      status: 200,
      headers: { "content-type": logo.type, "cache-control": "no-cache" },
    });
  }

  const fallback = DEFAULTS[variant];
  const bytes = await readFile(path.join(process.cwd(), "public", fallback.file));
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": fallback.type, "cache-control": "no-cache" },
  });
}

// Instance-admin. Multipart field `file` (png/jpeg/webp/svg, ~1MB; png/webp only
// for the icon). Stores the bytes as-is. 401 no session; 403 not instance-admin;
// 400 bad variant/type/size.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ variant: string }> },
) {
  const variant = parseVariant((await params).variant);
  if (!variant) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  if (!(await isInstanceAdmin(session.token))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!(variant === "icon" ? ICON_TYPES : ALLOWED_TYPES).has(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await setLogo(variant, bytes, file.type);
  return NextResponse.json({ ok: true });
}

// Instance-admin. Resets the variant to the bundled default. 401/403 as above.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ variant: string }> },
) {
  const variant = parseVariant((await params).variant);
  if (!variant) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  if (!(await isInstanceAdmin(session.token))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await clearLogo(variant);
  return NextResponse.json({ ok: true });
}
