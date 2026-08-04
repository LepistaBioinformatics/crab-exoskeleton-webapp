import {
  Building2,
  CalendarClock,
  Clock,
  FolderClosed,
  Bot,
  User,
  Search,
  ArrowRight,
  ArrowDown,
  FileText,
  FolderPlus,
  MessageSquare,
  Network,
  Tag,
  Wrench,
} from "lucide-react";
import type { LandingDict } from "@/lib/i18n/landing";
import styles from "./landing.module.css";

// Presentational diagrams for the landing. Each echoes a real product surface:
// HeroArt/CanvasMini/TreeMini mirror the canvas-timeline lanes and the
// conversation tree; InjectionFlow mirrors the separate secret channel;
// ComponentMap mirrors the lepista.com.br zombie-crab stack map; HierarchyTree
// mirrors the admin scope tree (same lucide icons). Product names are not
// translated; translatable labels arrive via props.

const CY = "#64c5eb";
const VI = "#b79ad6";
const MU = "#8ea3ab";

// growth delay helper
function d(sec: number) {
  return { animationDelay: `${sec}s` } as React.CSSProperties;
}

export function HeroArt({ label }: { label: string }) {
  return (
    <svg
      className={styles.svg}
      viewBox="0 0 460 360"
      role="img"
      aria-label={label}
    >
      <g strokeWidth={2.2}>
        <path
          className={`${styles.line} ${styles.lineCyan} ${styles.grow}`}
          pathLength={1}
          style={d(0.1)}
          d="M20 190 C110 190 130 120 210 120"
        />
        <path
          className={`${styles.line} ${styles.lineCyan} ${styles.grow}`}
          pathLength={1}
          style={d(0.5)}
          d="M210 120 C280 120 300 70 380 66"
        />
        <path
          className={`${styles.line} ${styles.lineViolet} ${styles.grow}`}
          pathLength={1}
          style={d(0.8)}
          d="M210 120 C270 120 300 175 360 180"
        />
        <path
          className={`${styles.line} ${styles.lineCyan} ${styles.grow}`}
          pathLength={1}
          style={d(0.4)}
          d="M20 190 C120 190 150 260 240 265"
        />
        <path
          className={`${styles.line} ${styles.lineCyan} ${styles.grow}`}
          pathLength={1}
          style={d(0.9)}
          d="M240 265 C300 265 320 300 400 305"
        />
        <path
          className={`${styles.line} ${styles.lineViolet} ${styles.grow}`}
          pathLength={1}
          style={d(1.1)}
          d="M240 265 C285 265 300 225 360 220"
        />
      </g>
      <g>
        {[
          [20, 190, 5, CY, 0.1],
          [210, 120, 6, CY, 0.7],
          [380, 66, 5, CY, 1.1],
          [360, 180, 4.5, VI, 1.3],
          [240, 265, 5.5, CY, 0.9],
          [400, 305, 5, CY, 1.6],
          [360, 220, 4.5, VI, 1.7],
        ].map(([cx, cy, r, fill, delay], i) => (
          <circle
            key={i}
            className={`${styles.node} ${styles.glowDot}`}
            style={d(delay as number)}
            cx={cx as number}
            cy={cy as number}
            r={r as number}
            fill={fill as string}
          />
        ))}
      </g>
    </svg>
  );
}

export function CanvasMini({ label }: { label: string }) {
  const lanes = [
    { y: 40, x2: 250, color: CY, nodes: [40, 110, 180, 250] },
    { y: 90, x2: 210, color: VI, nodes: [40, 130, 210] },
    { y: 140, x2: 290, color: CY, nodes: [40, 100, 170, 230, 290] },
  ];
  return (
    <svg
      className={styles.svg}
      viewBox="0 0 320 180"
      role="img"
      aria-label={label}
    >
      <g stroke="rgba(169,136,201,0.18)" strokeWidth={1} strokeDasharray="2 4">
        {[70, 130, 190, 250].map((x) => (
          <line key={x} x1={x} y1={16} x2={x} y2={164} />
        ))}
      </g>
      {lanes.map((l, li) => (
        <g key={li}>
          <path
            className={`${styles.line} ${styles.grow}`}
            pathLength={1}
            style={d(0.2 + li * 0.25)}
            stroke={l.color}
            strokeWidth={2.4}
            d={`M40 ${l.y} L${l.x2} ${l.y}`}
          />
          {l.nodes.map((x, ni) => (
            <circle
              key={ni}
              className={styles.node}
              style={d(0.4 + li * 0.25 + ni * 0.08)}
              cx={x}
              cy={l.y}
              r={ni === l.nodes.length - 1 ? 5 : 3.4}
              fill={l.color}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function TreeMini({ label }: { label: string }) {
  return (
    <svg
      className={styles.svg}
      viewBox="0 0 320 180"
      role="img"
      aria-label={label}
    >
      <g strokeWidth={2.2} fill="none">
        <path
          className={`${styles.line} ${styles.lineCyan} ${styles.grow}`}
          pathLength={1}
          style={d(0.1)}
          d="M40 90 H110"
        />
        <path
          className={`${styles.line} ${styles.lineCyan} ${styles.grow}`}
          pathLength={1}
          style={d(0.4)}
          d="M110 90 C150 90 150 45 200 45"
        />
        <path
          className={`${styles.line} ${styles.lineViolet} ${styles.grow}`}
          pathLength={1}
          style={d(0.5)}
          d="M110 90 C150 90 150 135 200 135"
        />
        <path
          className={`${styles.line} ${styles.lineCyan} ${styles.grow}`}
          pathLength={1}
          style={d(0.9)}
          d="M200 45 H280"
        />
        <path
          className={`${styles.line} ${styles.lineViolet} ${styles.grow}`}
          pathLength={1}
          style={d(1)}
          d="M200 135 C240 135 245 110 285 108"
        />
      </g>
      {[
        [40, 90, CY, 0.1],
        [110, 90, CY, 0.4],
        [200, 45, CY, 0.8],
        [200, 135, VI, 0.9],
        [280, 45, CY, 1.2],
        [285, 108, VI, 1.3],
      ].map(([cx, cy, fill, delay], i) => (
        <circle
          key={i}
          className={`${styles.node} ${styles.glowDot}`}
          style={d(delay as number)}
          cx={cx as number}
          cy={cy as number}
          r={5}
          fill={fill as string}
        />
      ))}
    </svg>
  );
}

export function InjectionFlow({ dict }: { dict: LandingDict["isolation"] }) {
  return (
    <div className={styles.channels}>
      <div className={styles.chanRow}>
        <div className={`${styles.chip} ${styles.chanCyan}`}>
          <div className={styles.chipTitle}>{dict.chatLabel}</div>
          <div className={styles.chipSub}>{dict.chatSub}</div>
        </div>
        <span className={styles.arrow} aria-hidden>
          <ArrowRight size={16} />
        </span>
      </div>
      <div className={styles.chanRow}>
        <div className={`${styles.chip} ${styles.chanViolet}`}>
          <div className={styles.chipTitle}>{dict.secretLabel}</div>
          <div className={styles.chipSub}>{dict.secretSub}</div>
        </div>
        <span className={styles.arrow} aria-hidden>
          <ArrowRight size={16} />
        </span>
      </div>
      <div className={styles.harnessBox}>{dict.harnessLabel}</div>
    </div>
  );
}

// A node in the stack map. Product names, kept short across two lines.
function MapNode({
  x,
  y,
  l1,
  l2,
  tone,
}: {
  x: number;
  y: number;
  l1: string;
  l2?: string;
  tone: "cy" | "vi" | "mu";
}) {
  const color = tone === "cy" ? CY : tone === "vi" ? VI : MU;
  const fill =
    tone === "mu"
      ? "rgba(142,163,171,0.08)"
      : `color-mix(in srgb, ${color} 12%, transparent)`;
  const w = 150;
  const h = 46;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={9}
        fill={fill}
        stroke={color}
        strokeWidth={1.4}
      />
      <text
        x={x + w / 2}
        y={l2 ? y + 20 : y + 27}
        textAnchor="middle"
        fontFamily="var(--ff-mono), monospace"
        fontSize={11}
        fill="#e9f1f4"
      >
        {l1}
      </text>
      {l2 && (
        <text
          x={x + w / 2}
          y={y + 33}
          textAnchor="middle"
          fontFamily="var(--ff-mono), monospace"
          fontSize={11}
          fill="#e9f1f4"
        >
          {l2}
        </text>
      )}
    </g>
  );
}

export function ComponentMap({
  doorLabel,
  label,
}: {
  doorLabel: string;
  label: string;
}) {
  return (
    <svg
      className={styles.svg}
      viewBox="0 0 560 360"
      role="img"
      aria-label={label}
    >
      {/* connectors */}
      <g stroke="rgba(169,136,201,0.5)" strokeWidth={1.5} fill="none">
        <path d="M174 83 C205 83 205 168 235 178" />
        <path d="M174 243 C205 243 205 192 235 192" />
        <path d="M345 180 C375 180 375 96 400 90" />
        <path d="M345 188 C375 188 380 176 400 172" />
        <path d="M470 116 L470 244" />
      </g>
      {/* authenticated door */}
      <line
        x1={210}
        y1={26}
        x2={210}
        y2={334}
        stroke={CY}
        strokeWidth={1.4}
        strokeDasharray="3 5"
        opacity={0.8}
      />
      <text
        x={210}
        y={18}
        textAnchor="middle"
        fontFamily="var(--ff-mono), monospace"
        fontSize={10}
        fill={CY}
        opacity={0.9}
      >
        {doorLabel}
      </text>

      <MapNode x={24} y={60} l1="crab-exoskeleton" l2="-webapp" tone="cy" />
      <MapNode x={24} y={220} l1="Mycelium WebApp" tone="vi" />
      <MapNode x={235} y={157} l1="Mycelium API" l2="Gateway" tone="vi" />
      <MapNode x={400} y={67} l1="crab-shell-proxy" tone="cy" />
      <MapNode x={400} y={149} l1="mycelium-sdk-go" tone="vi" />
      <MapNode x={400} y={244} l1="PicoClaw" tone="mu" />
    </svg>
  );
}

export function ComponentLegend({
  groups,
}: {
  groups: LandingDict["defense"]["groups"];
}) {
  return (
    <div className={styles.legend}>
      <span className={styles.legendItem}>
        <span className={styles.legendSwatch} style={{ background: VI }} />
        {groups.infra}
      </span>
      <span className={styles.legendItem}>
        <span className={styles.legendSwatch} style={{ background: CY }} />
        {groups.ai}
      </span>
      <span className={styles.legendItem}>
        <span className={styles.legendSwatch} style={{ background: MU }} />
        {groups.external}
      </span>
    </div>
  );
}

export function HierarchyTree({ dict }: { dict: LandingDict["hierarchy"] }) {
  const { labels, sample, perms } = dict;
  return (
    <div className={styles.tree}>
      <div className={styles.treeRow}>
        <Building2 size={16} className={styles.iTenant} aria-hidden />
        <span>{sample.tenant}</span>
        <span className={styles.treeKind}>· {labels.tenant}</span>
      </div>
      <div className={styles.treeChildren}>
        <div className={styles.treeRow}>
          <FolderClosed size={16} className={styles.iAccount} aria-hidden />
          <span>{sample.account}</span>
          <span className={styles.treeKind}>· {labels.account}</span>
        </div>
        <div className={styles.treeChildren}>
          <div className={styles.treeRow}>
            <Bot size={16} className={styles.iAgent} aria-hidden />
            <span>{sample.agentA}</span>
            <span className={styles.treeKind}>· {labels.agent}</span>
          </div>
          <div className={styles.treeChildren}>
            <div className={styles.treeRow}>
              <User size={16} className={styles.iMember} aria-hidden />
              <span>{sample.member}</span>
              <span className={styles.permChips}>
                <span className={`${styles.permChip} ${styles.permRead}`}>
                  {perms.read}
                </span>
                <span className={`${styles.permChip} ${styles.permWrite}`}>
                  {perms.write}
                </span>
              </span>
            </div>
          </div>
          <div className={styles.treeRow}>
            <Bot size={16} className={styles.iAgent} aria-hidden />
            <span>{sample.agentB}</span>
            <span className={styles.treeKind}>· {labels.agent}</span>
          </div>
          <div className={styles.treeChildren}>
            <div className={styles.treeRow}>
              <User size={16} className={styles.iMember} aria-hidden />
              <span>{sample.member}</span>
              <span className={styles.permChips}>
                <span className={`${styles.permChip} ${styles.permRead}`}>
                  {perms.read}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MemoryMock({
  dict,
  samples,
}: {
  dict: LandingDict["memory"];
  samples: readonly string[];
}) {
  const colors = [CY, VI, "#e0a94a"];
  return (
    <div className={styles.memWrap}>
      <div className={styles.filterBar}>
        <Search size={14} aria-hidden />
        <span>{dict.filterHint}</span>
      </div>
      {[0, 1].map((row) => (
        <div key={row} className={styles.convRow}>
          <span className={styles.convTitle}>{samples[row] ?? samples[0]}</span>
          <span className={styles.convAlias}>
            {row === 0 ? "@pipeline" : "@grant"}
          </span>
          <span className={styles.miniTag} tabIndex={0}>
            <Tag size={11} style={{ color: colors[row] }} aria-hidden />
            <span style={{ color: colors[row] }}>{row + 1}</span>
            <span className={styles.miniTagPop}>
              {dict.tagExamples.slice(0, row + 1).map((t, i) => (
                <span
                  key={t}
                  className={styles.tagChip}
                  style={{
                    borderColor: colors[i],
                    color: colors[i],
                    background: `color-mix(in srgb, ${colors[i]} 12%, transparent)`,
                  }}
                >
                  <Tag size={10} aria-hidden />
                  {t}
                </span>
              ))}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function FilesMock({ dict }: { dict: LandingDict["files"] }) {
  // The filter box holds a query ("proto"); rows that don't match dim out —
  // mirroring the filename-substring filter in the uploads sidebar.
  const q = "proto";
  return (
    <div>
      <div className={styles.filterBar} style={{ marginBottom: "0.75rem" }}>
        <Search size={14} aria-hidden />
        <span style={{ color: "#e9f1f4" }}>{q}</span>
        <span style={{ marginLeft: "auto", opacity: 0.6 }}>
          {dict.filterPlaceholder}
        </span>
      </div>
      {/* Folders first, as the sidebar orders them — the section claims you can make
          and rearrange them, so the figure has to show some. */}
      {dict.folderSample.map((name) => (
        <div key={name} className={styles.fileRow}>
          <FolderClosed size={15} aria-hidden />
          <span>{name}</span>
          <FolderPlus
            size={12}
            style={{ marginLeft: "auto", opacity: 0.5 }}
            aria-hidden
          />
        </div>
      ))}
      {dict.sample.map((name) => {
        const match = name.toLowerCase().includes(q);
        return (
          <div
            key={name}
            className={`${styles.fileRow} ${match ? "" : styles.fileDim}`}
          >
            <FileText
              size={15}
              className={match ? styles.fileMatch : ""}
              aria-hidden
            />
            <span className={match ? styles.fileMatch : ""}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A knowledge-graph ENTRY, deliberately not a network.
 *
 * A force-directed picture would promise a view the product does not have: the
 * interface is a browsable list with a detail pane (spec NFR-1). So this shows what a
 * member actually sees — an entity, its type, an observation, one link, and the
 * conversation the fact came out of.
 */
export function GraphMock({
  dict,
  label,
}: {
  dict: LandingDict["graph"];
  label: string;
}) {
  return (
    <div role="img" aria-label={label}>
      <div
        className={styles.fileRow}
        style={{ alignItems: "flex-start", gap: "0.6rem" }}
      >
        <Network size={15} className={styles.fileMatch} aria-hidden />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span className={styles.fileMatch} style={{ fontWeight: 600 }}>
              {dict.entity}
            </span>
            <span
              style={{
                fontSize: "0.62rem",
                padding: "0.1rem 0.4rem",
                borderRadius: "999px",
                border: "1px solid rgba(120, 220, 232, 0.4)",
                opacity: 0.85,
              }}
            >
              {dict.entityType}
            </span>
          </div>
          <p
            style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", opacity: 0.85 }}
          >
            {dict.observation}
          </p>
        </div>
      </div>

      <div
        className={styles.fileRow}
        style={{ fontSize: "0.72rem", opacity: 0.8 }}
      >
        <span className={styles.fileMatch}>{dict.entity}</span>
        <ArrowRight size={12} aria-hidden />
        <span style={{ fontStyle: "italic" }}>{dict.relationVerb}</span>
        <ArrowRight size={12} aria-hidden />
        <span className={styles.fileMatch}>{dict.relationTo}</span>
      </div>

      {/* Provenance. "when it can be traced" in the copy is load-bearing: a scheduled
          job or two concurrent chats produce a fact with no conversation attached. */}
      <div
        className={styles.fileRow}
        style={{ fontSize: "0.7rem", opacity: 0.7 }}
      >
        <MessageSquare size={12} aria-hidden />
        <span>{dict.sourceLabel}</span>
        <span className={styles.fileMatch}>{dict.sourceChat}</span>
      </div>
    </div>
  );
}

export function TemplatesMock({ dict }: { dict: LandingDict["hierarchy"] }) {
  return (
    <div className={styles.tmplWrap}>
      <div className={styles.tmplCard}>
        <Bot
          size={18}
          aria-hidden
          style={{ display: "block", margin: "0 auto 0.35rem", color: CY }}
        />
        {dict.sample.agentA}
        <div style={{ fontSize: "0.66rem", color: MU, marginTop: "0.2rem" }}>
          template
        </div>
      </div>
      <div>
        <ArrowRight
          size={16}
          aria-hidden
          style={{ color: MU, marginBottom: "0.4rem" }}
        />
        <div className={styles.clones}>
          {["user-a", "user-b", "user-c", "user-d"].map((u) => (
            <div key={u} className={styles.cloneCard}>
              <User size={12} aria-hidden />
              {u}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const NextIcon = ArrowDown;

/**
 * A scheduled task with its past runs.
 *
 * Shows exactly what the panel shows and nothing it does not: a schedule, a last and a
 * next run, older runs listed underneath, and one collapsed tool call. Notably absent —
 * any tick or cross beside a run. No per-run outcome is recorded anywhere, so a figure
 * with a green check would be inventing a capability.
 */
export function TasksMock({ dict }: { dict: LandingDict["scheduled"] }) {
  const s = dict.sample;
  return (
    <div>
      <div className={styles.fileRow} style={{ alignItems: "flex-start" }}>
        <CalendarClock size={15} aria-hidden />
        <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          <span style={{ color: "#e9f1f4" }}>{s.name}</span>
          <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>{s.schedule}</span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", opacity: 0.6 }}>
          {s.nextRun}
        </span>
      </div>
      <div className={styles.fileRow} style={{ opacity: 0.85 }}>
        <Clock size={13} aria-hidden />
        <span style={{ fontSize: "0.75rem" }}>{s.lastRun}</span>
        <span
          className={styles.filterBar}
          style={{ marginLeft: "auto", padding: "0.1rem 0.4rem", fontSize: "0.65rem" }}
        >
          <Wrench size={11} aria-hidden />
          {s.toolCall}
        </span>
      </div>
      {s.runs.map((run) => (
        <div key={run} className={styles.fileRow} style={{ opacity: 0.55 }}>
          <Clock size={13} aria-hidden />
          <span style={{ fontSize: "0.75rem" }}>{run}</span>
        </div>
      ))}
    </div>
  );
}
