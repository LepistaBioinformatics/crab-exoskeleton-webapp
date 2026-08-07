// The height every top-level panel header shares.
//
// The chat view's header and the workspace sidebar's header sit side by side, and both
// were sized by their CONTENT rather than by agreement: the chat's carries a two-line
// subscription/agent block (~36px) and the sidebar's a single row of 32px icon buttons,
// so with identical `py-2` they came out 52px and 48px. Four pixels, on the one seam
// where two headers meet at eye level.
//
// A floor rather than a fixed height: `items-center` keeps short content centred, and
// nothing clips if a locale or a font-size preference makes a line taller than the
// English measurement this was taken from. Both call sites must use it — that is the
// whole point of it being named.
export const PANEL_HEADER_H = "min-h-[3.25rem]";
