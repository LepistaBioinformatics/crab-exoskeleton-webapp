"use client";

import React from "react";
import { ArrowRight, Archive, GitMerge, MessageSquare, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { cva } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import {
  entitySources,
  entityTypeCounts,
  type Entity,
  type FullGraph,
  type RecentChanges,
  type Relation,
  type SummaryGraph,
} from "@/lib/memoryGraph";

// The knowledge graph's presentational pieces: a browse list, a search list, a
// recent-changes list and an entity detail pane. Pure functions of props, with no
// fetching and no state.
//
// Split out of the panel that renders them for two reasons. The suite runs
// `environment: "node"`, so effects never fire — rendering these directly is the
// only way to assert that real API shapes actually appear, and three of those shapes
// fail SILENTLY when read wrongly: the summary projection's `type` (not
// `entityType`), an absent `confidence` (not zero) and epoch milliseconds. And they
// outlived the drawer they were first written for.

const row = cva(
  "flex w-full flex-col gap-1 border-b border-brand/20 px-3 py-2 text-left transition-colors hover:bg-elevated",
  {
    variants: { selected: { true: "bg-elevated", false: "" } },
    defaultVariants: { selected: false },
  },
);

// The type chips. Only rendered when there is more than one type — with a single type
// the row is a control that can only ever say what the list already says.
const chip = cva(
  "rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none transition-colors",
  {
    variants: {
      active: {
        true: "border-accent/60 bg-accent/20 text-fg",
        false:
          "border-brand/40 text-fg-muted hover:border-accent/40 hover:text-fg",
      },
    },
    defaultVariants: { active: false },
  },
);

export function BrowseList({
  graph,
  selected,
  onSelect,
  emptyTitle,
  emptyBody,
  observationsLabel,
  relationsLabel,
  typeFilter,
  onTypeFilter,
  allLabel,
  noneOfTypeLabel,
}: {
  graph: SummaryGraph;
  selected: string | null;
  onSelect: (name: string) => void;
  emptyTitle: string;
  emptyBody: string;
  observationsLabel: string;
  relationsLabel: string;
  /** null = every type. Owned by the panel so it survives a re-fetch. */
  typeFilter?: string | null;
  onTypeFilter?: (type: string | null) => void;
  allLabel?: string;
  noneOfTypeLabel?: string;
}) {
  const types = entityTypeCounts(graph.entities);
  const shown = typeFilter
    ? graph.entities.filter((e) => e.type === typeFilter)
    : graph.entities;

  if (graph.entities.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="font-display text-sm font-semibold text-fg">
          {emptyTitle}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          {emptyBody}
        </p>
      </div>
    );
  }
  return (
    <>
      {/* Filtering by entityType is the organisation axis that needs no new concept:
          one value per entity, so it partitions the list cleanly. Overlapping themes
          are modelled as entities with relations instead — which is what makes the
          navigable relation endpoints above matter. */}
      {onTypeFilter && types.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-brand/20 px-3 py-2">
          <button
            type="button"
            className={chip({ active: !typeFilter })}
            aria-pressed={!typeFilter}
            onClick={() => onTypeFilter(null)}
          >
            {allLabel} {graph.entities.length}
          </button>
          {types.map((t) => (
            <button
              key={t.type}
              type="button"
              className={chip({ active: typeFilter === t.type })}
              aria-pressed={typeFilter === t.type}
              onClick={() =>
                onTypeFilter(typeFilter === t.type ? null : t.type)
              }
            >
              {t.type} {t.count}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-fg-muted">
          {noneOfTypeLabel}
        </p>
      ) : (
        <ul>
          {shown.map((e) => (
            <li key={e.name}>
              <button
                type="button"
                className={row({ selected: selected === e.name })}
                onClick={() => onSelect(e.name)}
                aria-expanded={selected === e.name}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                    {e.name}
                  </span>
                  {/* `type`, NOT `entityType` — the summary projection renames it. */}
                  <Badge tone="accent">{e.type}</Badge>
                </span>
                {e.firstObservation && (
                  <span className="line-clamp-2 text-xs leading-snug text-fg-muted">
                    {e.firstObservation}
                  </span>
                )}
                <span className="flex gap-3 text-[11px] text-fg-muted">
                  <span>
                    {e.observationCount} {observationsLabel}
                  </span>
                  <span>
                    {e.relationCount} {relationsLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function SearchList({
  hits,
  selected,
  onSelect,
  noResults,
}: {
  hits: FullGraph;
  selected: string | null;
  onSelect: (name: string) => void;
  noResults: string;
}) {
  if (hits.entities.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-xs text-fg-muted">{noResults}</p>
    );
  }
  return (
    <ul>
      {hits.entities.map((e) => (
        <li key={e.name}>
          <button
            type="button"
            className={row({ selected: selected === e.name })}
            onClick={() => onSelect(e.name)}
            aria-expanded={selected === e.name}
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                {e.name}
              </span>
              {/* Full detail here, so it really is `entityType`. */}
              <Badge tone="accent">{e.entityType}</Badge>
            </span>
            {e.observations[0] && (
              <span className="line-clamp-2 text-xs leading-snug text-fg-muted">
                {e.observations[0].content}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RecentList({
  recent,
  onSelect,
  formatWhen,
  copy,
}: {
  recent: RecentChanges;
  onSelect: (name: string) => void;
  formatWhen: (ms?: number) => string;
  copy: {
    learned: string;
    newEntities: string;
    newRelations: string;
    nothing: string;
  };
}) {
  const nothing =
    recent.recentEntities.length === 0 &&
    recent.recentRelations.length === 0 &&
    recent.recentObservations.length === 0;
  if (nothing) {
    return (
      <p className="px-4 py-8 text-center text-xs text-fg-muted">
        {copy.nothing}
      </p>
    );
  }
  return (
    <div className="pb-3">
      {recent.recentObservations.length > 0 && (
        <section className="px-3 pt-2">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {copy.learned}
          </h3>
          <ul className="space-y-1">
            {recent.recentObservations.map((eo) => (
              <li key={eo.entity}>
                <button
                  type="button"
                  onClick={() => onSelect(eo.entity)}
                  className="w-full rounded-lg border border-brand/30 bg-elevated px-2 py-1.5 text-left transition-colors hover:bg-surface"
                >
                  <span className="block truncate text-xs font-medium text-fg">
                    {eo.entity}
                  </span>
                  {eo.observations.map((o, i) => (
                    <span
                      key={i}
                      className="mt-0.5 block text-[11px] leading-snug text-fg-muted"
                    >
                      {o.content}
                      <span className="ml-1 opacity-70">
                        {formatWhen(o.timestamp)}
                      </span>
                    </span>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.recentEntities.length > 0 && (
        <section className="px-3 pt-3">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {copy.newEntities}
          </h3>
          <ul className="flex flex-wrap gap-1">
            {recent.recentEntities.map((e) => (
              <li key={e.name}>
                <button type="button" onClick={() => onSelect(e.name)}>
                  <Badge tone="accent">{e.name}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.recentRelations.length > 0 && (
        <section className="px-3 pt-3">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {copy.newRelations}
          </h3>
          <ul className="space-y-1">
            {recent.recentRelations.map((r, i) => (
              <li key={i}>
                <RelationLine relation={r} onOpen={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// An endpoint is a link unless it is the entity you are already looking at — clicking
// that would be a no-op that still looks clickable.
const endpoint = cva("truncate rounded px-0.5 text-left", {
  variants: {
    navigable: {
      true: "text-accent underline decoration-dotted underline-offset-2 hover:bg-accent/10",
      false: "text-fg",
    },
  },
  defaultVariants: { navigable: false },
});

/**
 * One edge, with both endpoints navigable.
 *
 * Being able to WALK the graph is the point: organising by theme (a "tema" entity with
 * relations to its members) is only useful if opening the theme lets you jump to what
 * it contains. Before this, both endpoints were plain text and the relation list was a
 * dead end.
 */
export function RelationLine({
  relation,
  current,
  onOpen,
}: {
  relation: Relation;
  /** The entity being viewed, rendered plain rather than as a link to itself. */
  current?: string;
  onOpen?: (name: string) => void;
}) {
  const side = (name: string) => {
    const navigable = onOpen !== undefined && name !== current;
    if (!navigable) {
      return (
        <span className={endpoint({ navigable: false })} title={name}>
          {name}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={endpoint({ navigable: true })}
        title={name}
        onClick={() => onOpen?.(name)}
      >
        {name}
      </button>
    );
  };
  return (
    <span className="flex items-center gap-1 text-[11px] text-fg-muted">
      {side(relation.from)}
      <ArrowRight size={11} className="shrink-0" aria-hidden />
      <span className="shrink-0 italic">{relation.relationType}</span>
      <ArrowRight size={11} className="shrink-0" aria-hidden />
      {side(relation.to)}
    </span>
  );
}

export function EntityDetail({
  entity,
  relations,
  formatWhen,
  copy,
  conversationTitle,
  onOpenConversation,
  onOpenEntity,
  height,
  onResizeStart,
  onClose,
}: {
  entity: Entity;
  relations: Relation[];
  formatWhen: (ms?: number) => string;
  copy: {
    observations: string;
    relations: string;
    archived: string;
    mergedInto: string;
    confidence: string;
    noObservations: string;
    sources: string;
    sourcesHint: string;
    noSources: string;
    goneConversation: string;
    closeDetail: string;
    resizeDetail: string;
  };
  /** Pixel height, owned by the panel so it survives re-selecting an entity. */
  height: number;
  onResizeStart: (e: React.MouseEvent) => void;
  onClose: () => void;
  /** Title for a conversation id, or null when it no longer exists. */
  conversationTitle?: (sessionId: string) => string | null;
  onOpenConversation?: (sessionId: string) => void;
  /** Opens another entity — how a member walks from a theme to its members. */
  onOpenEntity?: (name: string) => void;
}) {
  const sources = entitySources(entity);
  return (
    <div
      className="flex shrink-0 flex-col border-t-2 border-accent/60 bg-surface shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.45)]"
      style={{ height }}
    >
      {/* The drag handle. The pane sits UNDER the list it was opened from, so without a
          way to resize it a long entity is read three lines at a time — and the list
          above is what a member is comparing against. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={copy.resizeDetail}
        onMouseDown={onResizeStart}
        className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center hover:bg-accent/20"
      >
        <span
          className="h-0.5 w-8 rounded-full bg-brand group-hover:bg-accent"
          aria-hidden
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg">
            {entity.name}
          </h3>
          <Badge tone="accent">{entity.entityType}</Badge>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={copy.closeDetail}
            onClick={onClose}
          >
            <X size={15} aria-hidden />
          </IconButton>
        </div>

        {/* Archived and merged entities are reachable BY NAME even though the browse
          list hides them, so the detail pane has to say which one you are looking at. */}
        {entity.archived && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-fg-muted">
            <Archive size={11} aria-hidden />
            {copy.archived}
          </p>
        )}
        {entity.merged && entity.mergedInto && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-fg-muted">
            <GitMerge size={11} aria-hidden />
            {copy.mergedInto}{" "}
            <span className="font-medium text-fg">{entity.mergedInto}</span>
          </p>
        )}

        <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
          {copy.observations}
        </h4>
        {entity.observations.length === 0 ? (
          <p className="mt-1 text-xs text-fg-muted">{copy.noObservations}</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {entity.observations.map((o, i) => (
              <li
                key={i}
                className="rounded-lg border border-brand/30 bg-surface px-2 py-1.5"
              >
                <p className="text-xs leading-relaxed text-fg">{o.content}</p>
                <p className="mt-0.5 flex gap-2 text-[10px] text-fg-muted">
                  <span>{formatWhen(o.timestamp)}</span>
                  {/* Absent, not zero, when the record never carried one. */}
                  {o.confidence !== undefined && (
                    <span>
                      {copy.confidence} {Math.round(o.confidence * 100)}%
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}

        <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
          {copy.sources}
        </h4>
        {sources.length === 0 ? (
          // Absent provenance is NORMAL — a cron job, the heartbeat, concurrent
          // conversations, or anything stored before the field existed. Say so plainly
          // rather than rendering an empty box that reads as a failure.
          <p className="mt-1 text-[11px] leading-snug text-fg-muted">
            {copy.noSources}
          </p>
        ) : (
          <>
            <p className="mt-1 text-[10px] leading-snug text-fg-muted">
              {copy.sourcesHint}
            </p>
            <ul className="mt-1 space-y-1">
              {sources.map((src) => {
                const title = conversationTitle?.(src.sessionId) ?? null;
                // A conversation can be deleted from the webapp's own store while the
                // graph keeps its id. Render that as unavailable rather than as a link
                // that navigates nowhere.
                if (title === null) {
                  return (
                    <li
                      key={src.sessionId}
                      className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-fg-muted"
                    >
                      <MessageSquare
                        size={11}
                        className="shrink-0 opacity-50"
                        aria-hidden
                      />
                      <span className="truncate italic">
                        {copy.goneConversation}
                      </span>
                      <span className="shrink-0 opacity-70">
                        {formatWhen(src.at)}
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={src.sessionId}>
                    <button
                      type="button"
                      onClick={() => onOpenConversation?.(src.sessionId)}
                      className="flex w-full items-center gap-1.5 rounded-lg border border-brand/30 bg-surface px-2 py-1 text-left text-[11px] transition-colors hover:border-accent/50 hover:bg-elevated"
                    >
                      <MessageSquare
                        size={11}
                        className="shrink-0 text-accent"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-fg">
                        {title}
                      </span>
                      <span className="shrink-0 text-fg-muted opacity-70">
                        {formatWhen(src.at)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {relations.length > 0 && (
          <>
            <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
              {copy.relations}
            </h4>
            <ul className="mt-1 space-y-1">
              {relations.map((r, i) => (
                <li key={i}>
                  <RelationLine
                    relation={r}
                    current={entity.name}
                    onOpen={onOpenEntity}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
