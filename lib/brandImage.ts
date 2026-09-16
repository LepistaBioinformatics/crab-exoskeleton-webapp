// Preparing a tenant logo for the wire.
//
// The logo travels as a data URL inside a JSON-RPC body and is stored in a tag's
// `meta` map. The gateway is not a file server and that map is not a blob store,
// so the image is downscaled in the browser first and refused here if it is still
// too big -- refusing locally beats sending a megabyte and reading back an error
// about deserialization.

/** The avatar renders at ~16px in the sidebar; 256 is generous for retina. */
export const BRAND_MAX_EDGE = 256;

/** Data-URL characters. Comfortably above a 256px WebP, far below anything that
 *  would bloat every tenant list response that carries the tag. */
export const BRAND_MAX_CHARS = 128 * 1024;

export function isWithinBrandLimit(dataUrl: string): boolean {
  return dataUrl.length <= BRAND_MAX_CHARS;
}

// The edge lengths that fit a square box while keeping the aspect ratio. Pure, so
// the arithmetic is tested without a canvas.
export function fitWithin(
  width: number,
  height: number,
  maxEdge = BRAND_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

// Browser-only: decode, downscale, re-encode. WebP with a JPEG fallback, since
// `toDataURL` silently returns a PNG when it does not know the type asked for --
// which would be several times larger and could push a fine image over the limit.
export async function encodeBrandLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("unknown");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const webp = canvas.toDataURL("image/webp", 0.85);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", 0.85);
}
