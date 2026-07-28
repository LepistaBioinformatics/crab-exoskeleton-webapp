import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cva } from "class-variance-authority";
import CodeBlock from "@/app/chat/code-block";

// Half the gap between the content section edge and the 720px message column, in
// container-query units against the band (see chat-view's messageBand). 50cqw is
// half the content section; 360px is half the message column, so this is zero
// until the section is wider than the column, and max(0px, …) clamps it so a
// table never spills when the section is narrower.
const GUTTER = "max(0px, 50cqw - 360px)";

// Applied only to tables WIDER than the message column (measured at runtime).
// The negative left/right margins widen the scroll area out to the full content
// section (~1rem inset each side); the matching left/right padding makes the
// scroll extremes anchor to the message column edges -- scroll fully left and the
// table's left edge lines up with the message text; scroll fully right and its
// right edge does too -- while the middle of the scroll range uses the whole
// section. Narrow tables get none of this and stay aligned in the column.
const tableBreakout: CSSProperties = {
  marginLeft: `calc(0px - ${GUTTER})`,
  marginRight: `calc(0px - ${GUTTER})`,
  paddingLeft: GUTTER,
  paddingRight: GUTTER,
};

// Wraps a markdown table and, when the table's natural width exceeds the message
// column, breaks it out across the content section (see tableBreakout). The
// decision is measured -- table width vs. the column (the markdown root, whose
// width the breakout's negative margins don't change) -- and re-measured on any
// resize (viewport, sidebar toggles, streamed content growing the table).
function MarkdownTable({ children }: { children?: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const wrap = wrapRef.current;
    const column = wrap?.parentElement;
    const table = wrap?.querySelector("table");
    if (!wrap || !column || !table) return;
    const measure = () => setWide(table.scrollWidth > column.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={wrapRef} className="my-4 overflow-x-auto" style={wide ? tableBreakout : undefined}>
      {/* border-separate with a single top+left border per cell draws clean
          single-line grid rules (right/bottom edges and rounded outer corners are
          added at the table's edge cells) -- the Notion look, which
          border-collapse can't round. w-max keeps the table's natural width so
          columns aren't squeezed. */}
      <table className="w-max border-separate border-spacing-0 text-left text-[0.9em] [&_thead_th]:bg-current/[0.05] [&_tr>*:last-child]:border-r [&_tr:last-child>*]:border-b [&_tr:first-child>*:first-child]:rounded-tl-md [&_tr:first-child>*:last-child]:rounded-tr-md [&_tr:last-child>*:first-child]:rounded-bl-md [&_tr:last-child>*:last-child]:rounded-br-md">
        {children}
      </table>
    </div>
  );
}

// Inline code gets a tinted chip; fenced/block code is bare (its <pre> wrapper
// carries the surface). `bg-current/*` tints toward the text color so it reads
// on both the neutral assistant bubble and the accent-filled user bubble.
const codeText = cva("font-mono text-[0.85em]", {
  variants: {
    block: { true: "", false: "rounded bg-current/10 px-1 py-0.5" },
  },
  defaultVariants: { block: false },
});

// Renders assistant/user message content as markdown. GitHub-flavored
// (remark-gfm) so tables, strikethrough, task lists and autolinks work. Colors
// inherit from the bubble; borders/fills use currentColor so they adapt to it.
// Code blocks scroll horizontally inside the message column. Tables narrower than
// the column stay aligned with the text; wider ones break out across the full
// content section and scroll there (Notion-style) -- see MarkdownTable.
export default function MessageContent({
  content,
  streaming = false,
}: {
  content: string;
  /**
   * True only for the assistant band that is still being revealed. Code blocks are
   * left un-highlighted while it is set — see code-block.tsx for why that is a
   * decision about the reveal's re-render budget rather than an optimization.
   */
  streaming?: boolean;
}) {
  return (
    // Slightly larger than the rest of the UI (which is text-sm/xs) so the chat
    // body reads as the primary content.
    <div className="text-base leading-relaxed [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc pl-6 marker:text-current/60 [&_ol]:mb-0 [&_ul]:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal pl-6 marker:text-current/60 [&_ol]:mb-0 [&_ul]:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="mb-0.5 [&>ol]:mt-0.5 [&>ul]:mt-0.5">{children}</li>,
          h1: ({ children }) => <h1 className="mb-2 mt-1 font-display text-lg font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-1 font-display text-base font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-1 font-display text-sm font-bold">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1 font-display text-sm font-semibold">{children}</h4>,
          h5: ({ children }) => (
            <h5 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-current/70">
              {children}
            </h6>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="line-through opacity-70">{children}</del>,
          hr: () => <hr className="my-3 border-current/20" />,
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-current/30 pl-3 italic opacity-90">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            // react-markdown v9 gives block-level code a `language-*` className
            // (from the fenced ```lang block); inline code has none.
            const isBlock = Boolean(className);
            if (!isBlock) {
              return <code className={codeText({ block: false })}>{children}</code>;
            }
            // A fenced block: the className carries the language, and the children
            // are the code text.
            return (
              <CodeBlock
                code={String(children ?? "")}
                className={`${codeText({ block: true })} ${className}`}
                streaming={streaming}
              />
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-current/10 p-3">{children}</pre>
          ),
          table: ({ children }) => (
            <MarkdownTable>{children}</MarkdownTable>
          ),
          th: ({ children }) => (
            <th className="min-w-[7rem] max-w-[32rem] border-l border-t border-current/15 px-3 py-2 align-top font-semibold [overflow-wrap:break-word]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="min-w-[7rem] max-w-[32rem] border-l border-t border-current/15 px-3 py-2 align-top [overflow-wrap:break-word]">
              {children}
            </td>
          ),
          input: (props) => (
            <input {...props} disabled className="mr-1 align-middle accent-accent" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
