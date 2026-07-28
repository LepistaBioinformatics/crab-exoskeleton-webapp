"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Lock, Plus, Trash2 } from "lucide-react";
import { cva } from "class-variance-authority";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { adminCopy } from "@/lib/i18n/admin";
import {
  addKey,
  appendItem,
  coerce,
  dotted,
  isWithin,
  removeAtPath,
  setAtPath,
  typeOf,
  DUPLICATE_KEY,
  type JsonType,
  type JsonValue,
  type Path,
} from "./json-tree";

// The tree half of the instance-config editor: a key/value form over the parsed
// document, so an admin can fix one value without hand-balancing braces.
//
// Presentation only. Every change goes through the pure primitives in
// ./json-tree.ts and leaves through onChange as a WHOLE new document — the editor
// re-serializes it, and the text stays the single source of truth.

const LEAF_TYPES: JsonType[] = ["string", "number", "boolean", "null"];

// Rows are indented by depth and dimmed when the proxy owns them. Managed rows
// carry no control at all, so the styling is the only signal left.
const row = cva("flex items-center gap-2 rounded-lg py-1 pr-1", {
  variants: {
    managed: {
      true: "bg-elevated/40",
      false: "",
    },
  },
  defaultVariants: { managed: false },
});

const label = cva("shrink-0 font-mono text-xs", {
  variants: {
    managed: {
      true: "text-fg-muted",
      false: "text-fg",
    },
  },
  defaultVariants: { managed: false },
});

export function JsonTree({
  doc,
  managed,
  redacted = [],
  onChange,
}: {
  doc: JsonValue;
  managed: string[];
  redacted?: string[];
  onChange: (next: JsonValue) => void;
}) {
  // Expansion is keyed by dotted path and lives here rather than per node, so a
  // value edit (which replaces the document) does not collapse the branch the
  // admin is working in.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col">
      <Node
        value={doc}
        path={[]}
        managed={managed}
        redacted={redacted}
        open={open}
        setOpen={setOpen}
        onEdit={(path, next) => onChange(setAtPath(doc, path, next))}
        onRemove={(path) => onChange(removeAtPath(doc, path))}
        onAddKey={(path, key) => {
          const next = addKey(doc, path, key);
          if (next === DUPLICATE_KEY) return false;
          onChange(next);
          return true;
        }}
        onAppend={(path) => onChange(appendItem(doc, path))}
      />
    </div>
  );
}

interface NodeProps {
  value: JsonValue;
  path: Path;
  managed: string[];
  redacted: string[];
  open: Record<string, boolean>;
  setOpen: (next: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  onEdit: (path: Path, next: JsonValue) => void;
  onRemove: (path: Path) => void;
  onAddKey: (path: Path, key: string) => boolean;
  onAppend: (path: Path) => void;
}

function Node(props: NodeProps) {
  const { value, path, managed, redacted, open, setOpen } = props;
  const t = useT(adminCopy).instanceConfig;
  const key = dotted(path);
  const kind = typeOf(value);
  const container = kind === "object" || kind === "array";
  const locked = isWithin(path, managed);
  // The credential lives in the LEAF under the redacted path (api_keys[0]), not
  // at the path itself, so containment is the test — an equality check printed
  // the value straight into an input.
  const masked = isWithin(path, redacted);

  // Below the second level everything starts collapsed: the seeded document is
  // ~470 lines with 15 channel blocks, and an all-expanded tree is unusable.
  const expanded = open[key] ?? path.length < 2;

  const entries: [string | number, JsonValue][] = !container
    ? []
    : Array.isArray(value)
      ? value.map((v, i) => [i, v])
      : Object.entries(value as Record<string, JsonValue>);

  return (
    <div className="flex flex-col" data-path={key}>
      {path.length > 0 && (
        <div className={row({ managed: locked })} style={{ paddingLeft: `${(path.length - 1) * 14}px` }}>
          {container ? (
            <IconButton
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-label={`${expanded ? t.collapse : t.expand} ${key}`}
              onClick={() => setOpen((prev) => ({ ...prev, [key]: !expanded }))}
            >
              {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            </IconButton>
          ) : (
            <span className="w-8 shrink-0" aria-hidden />
          )}

          <span className={label({ managed: locked })}>{path[path.length - 1]}</span>

          {locked && <Lock size={12} className="shrink-0 text-fg-muted" aria-label={t.managedAria} />}

          {container ? (
            <Badge tone="neutral">
              {kind === "array" ? `[${entries.length}]` : `{${entries.length}}`}
            </Badge>
          ) : (
            <Leaf {...props} locked={locked} masked={masked} kind={kind} />
          )}

          {!locked && (
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={`${t.removeKey} ${key}`}
              onClick={() => props.onRemove(path)}
            >
              <Trash2 size={13} aria-hidden />
            </IconButton>
          )}
        </div>
      )}

      {container && expanded && (
        <div className="flex flex-col">
          {entries.map(([seg, child]) => (
            <Node {...props} key={String(seg)} value={child} path={[...path, seg]} />
          ))}
          {!locked && (
            <AddControl
              kind={kind}
              depth={path.length}
              onAddKey={(name) => props.onAddKey(path, name)}
              onAppend={() => props.onAppend(path)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Leaf({
  value,
  path,
  locked,
  masked,
  kind,
  onEdit,
}: NodeProps & { locked: boolean; masked: boolean; kind: JsonType }) {
  const t = useT(adminCopy).instanceConfig;
  const key = dotted(path);

  // A managed or masked leaf renders as text with no control: the proxy replaces
  // managed values on every materialization, and a masked one is a credential
  // this screen must not display.
  if (locked || masked) {
    return (
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
        {masked ? "***" : JSON.stringify(value)}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {kind === "boolean" ? (
        <label className="flex items-center gap-1.5 text-xs text-fg">
          <input
            type="checkbox"
            checked={value === true}
            aria-label={key}
            onChange={(e) => onEdit(path, e.target.checked)}
          />
          {String(value)}
        </label>
      ) : kind === "null" ? (
        <span className="font-mono text-xs text-fg-muted">null</span>
      ) : (
        <Input
          inputSize="sm"
          variant="subtle"
          className="font-mono text-xs"
          type={kind === "number" ? "number" : "text"}
          aria-label={key}
          value={String(value)}
          onChange={(e) =>
            onEdit(path, kind === "number" ? coerce(e.target.value, "number") : e.target.value)
          }
        />
      )}

      {/* The type switcher is what makes a wrongly-typed value recoverable —
          `"max_tokens": "32768"` as a string is a primary repair case and a typed
          input alone cannot express it. */}
      <select
        aria-label={`${t.typeLabel} ${key}`}
        className="shrink-0 rounded-lg border border-brand bg-elevated px-1 py-0.5 text-[11px] text-fg"
        value={kind}
        onChange={(e) => onEdit(path, coerce(value, e.target.value as JsonType))}
      >
        {LEAF_TYPES.map((tp) => (
          <option key={tp} value={tp}>
            {tp}
          </option>
        ))}
      </select>
    </div>
  );
}

// AddControl is an object's "add key" and an array's "append item". A duplicate
// key is refused inline rather than overwriting the sibling that already holds
// that name.
function AddControl({
  kind,
  depth,
  onAddKey,
  onAppend,
}: {
  kind: JsonType;
  depth: number;
  onAddKey: (key: string) => boolean;
  onAppend: () => void;
}) {
  const t = useT(adminCopy).instanceConfig;
  const [name, setName] = useState("");
  const [duplicate, setDuplicate] = useState(false);

  if (kind === "array") {
    return (
      <div className="flex items-center py-1" style={{ paddingLeft: `${depth * 14 + 32}px` }}>
        <button
          type="button"
          onClick={onAppend}
          className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <Plus size={13} aria-hidden />
          {t.appendItem}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 py-1"
      style={{ paddingLeft: `${depth * 14 + 32}px` }}
    >
      <div className="flex items-center gap-1.5">
        <Input
          inputSize="sm"
          variant="subtle"
          className="max-w-48 font-mono text-xs"
          placeholder={t.newKeyPlaceholder}
          aria-label={t.addKey}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDuplicate(false);
          }}
        />
        <button
          type="button"
          disabled={name.trim() === ""}
          onClick={() => {
            if (onAddKey(name.trim())) {
              setName("");
              setDuplicate(false);
            } else {
              setDuplicate(true);
            }
          }}
          className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg disabled:opacity-40"
        >
          <Plus size={13} aria-hidden />
          {t.addKey}
        </button>
      </div>
      {duplicate && <span className="text-xs text-red-500">{t.duplicateKey}</span>}
    </div>
  );
}
