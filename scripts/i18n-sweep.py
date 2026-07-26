#!/usr/bin/env python3
"""Find user-visible strings that never made it into lib/i18n.

The dictionary parity test (lib/i18n/parity.test.ts) proves en and pt agree.
It cannot see copy that was never put in a dictionary at all. This sweep is
the other half of that check.

Run from the repo root:  python3 scripts/i18n-sweep.py

Two lessons are baked in, both learned from real misses:
  - JSX text nodes span LINES, so the match has to be multi-line. An earlier
    single-line regex silently passed 45 untranslated strings.
  - .ts files carry UI copy too (lib/models.ts built the resolution-ladder
    labels), so this does not stop at .tsx.

Some noise is expected: generics like useRef<T>(null) look like JSX text, and
SQL reads like prose. Filter it out; the point is the signal, not a zero.
"""

import os
import re

SKIP_PREFIXES = ("lib/i18n",)
ROOTS = ("app", "components", "lib")

# Two words in a row is what separates prose from an identifier.
WORDY = re.compile(r"[A-Za-z]{2,}\s+[A-Za-z]{2,}")

NOISE = re.compile(
    r"useRef|useState|const |=> |Map<|Set<|forwardRef"
    r"|SELECT |INSERT |UPDATE |DELETE |null = null"
)


def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"^\s*//.*$", "", src, flags=re.M)
    src = re.sub(r"\{/\*.*?\*/\}", "", src, flags=re.S)
    return src


def sources():
    found = []
    for root in ROOTS:
        for dirpath, _, filenames in os.walk(root):
            if "node_modules" in dirpath:
                continue
            for name in filenames:
                if name.endswith((".test.ts", ".test.tsx")):
                    continue
                if not name.endswith((".ts", ".tsx")):
                    continue
                path = os.path.join(dirpath, name)
                if path.startswith(SKIP_PREFIXES):
                    continue
                found.append(path)
    return sorted(found)


def hits(path):
    src = strip_comments(open(path).read())
    out = []

    if path.endswith(".tsx"):
        # JSX text nodes, which routinely wrap across lines.
        for m in re.finditer(r">([^<>{}]{4,}?)<", src, flags=re.S):
            text = " ".join(m.group(1).split())
            if not text or not WORDY.search(text):
                continue
            if text.startswith(("http", "/", ".")):
                continue
            out.append((src[: m.start()].count("\n") + 1, "jsx", text[:90]))

    # String literals that read like sentences rather than identifiers.
    for m in re.finditer(r'["`]([A-Z][^"`\\{}]{9,}?)["`]', src):
        text = m.group(1)
        if not WORDY.search(text):
            continue
        if text.startswith(("http", "Content-Type", "application/", "image/", "text/")):
            continue
        out.append((src[: m.start()].count("\n") + 1, "str", text[:90]))

    return out


def main():
    total = 0
    for path in sources():
        for line, kind, text in hits(path):
            row = "%s:%d [%s] %s" % (path, line, kind, text)
            if NOISE.search(row):
                continue
            total += 1
            print(row)
    print("\n%d candidate untranslated strings" % total)


if __name__ == "__main__":
    main()
