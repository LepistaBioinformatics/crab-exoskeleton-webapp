// The markdown editor as a plain textarea, for test suites that render a form holding
// one. jsdom cannot drive a contenteditable, and those suites assert the form -- which
// field feeds which part of what is sent -- not the editor. Same value/onChange
// contract as app/chat/markdown-field.tsx.
//
// Used by replacing `next/dynamic`, which is what loads the real one:
//   vi.mock("next/dynamic", async () => (await import("./markdown-field.test-double")).dynamicMock);
export default function MarkdownFieldDouble({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}

export const dynamicMock = { default: () => MarkdownFieldDouble };
