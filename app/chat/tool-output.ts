// How a tool's output is presented in a run's transcript.
//
// picoclaw writes tool results and tool-call arguments as ONE LINE. For JSON that is a wall
// of text nobody reads; pretty-printed it is the thing the member opened the run to see. But
// plenty of results are not JSON at all — a web search comes back as prose — so the format is
// detected rather than assumed, and a wrong guess must degrade to showing the text as it is.

/** The largest body worth pretty-printing and highlighting. */
export const MAX_FORMATTED_BYTES = 100_000;

export interface ToolBody {
  text: string;
  /**
   * A `language-*` class for CodeBlock, or undefined for plain text.
   *
   * Undefined is not a failure: highlighting prose as if it were code produces confident,
   * meaningless colour, which reads worse than no highlighting.
   */
  className?: string;
  /** True when the text was reformatted, so the UI can say so rather than implying it is raw. */
  reformatted: boolean;
}

export function formatToolBody(raw: string): ToolBody {
  const trimmed = raw.trim();
  if (!trimmed) return { text: raw, reformatted: false };

  // Cheap gate before parsing: a search result that happens to be long should not cost a
  // JSON.parse attempt over 100 KB of prose.
  const looksStructured = /^[[{]/.test(trimmed);

  // Past the cap, show it as it came. Pretty-printing multiplies the size and highlight.js
  // walks the whole string — on a tool result that already reaches six figures of bytes,
  // that is paid on the main thread for output nobody scrolls to the end of.
  if (!looksStructured || trimmed.length > MAX_FORMATTED_BYTES) {
    return { text: raw, reformatted: false };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    // A bare scalar parses fine and gains nothing from being re-emitted.
    if (parsed === null || typeof parsed !== "object") {
      return { text: raw, reformatted: false };
    }
    return {
      text: JSON.stringify(parsed, null, 2),
      className: "language-json",
      reformatted: true,
    };
  } catch {
    // Starts like JSON and is not: a truncated result, or prose that opens with a bracket.
    return { text: raw, reformatted: false };
  }
}
