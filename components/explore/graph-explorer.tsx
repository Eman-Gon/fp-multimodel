"use client";

import Link from "next/link";
import {
  ArrowRight,
  Database,
  Eye,
  FlaskConical,
  Info,
  LayoutList,
  Network,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  GraphDataset,
  GraphNode,
  GraphNodeKind,
  GraphPropertyValue,
  GraphRelationshipKind,
  GraphScope,
} from "@/lib/track-c/graph.ts";
import { GraphCanvas } from "./graph-canvas.tsx";
import {
  GRAPH_KIND_ORDER,
  GRAPH_KIND_STYLE,
  GRAPH_RELATIONSHIP_ORDER,
  graphRelationshipLabel,
  humanizeGraphValue,
} from "./graph-visuals.ts";

interface GraphExplorerProps {
  readonly demoDataset: GraphDataset;
  readonly confirmedDataset: GraphDataset;
}

export function GraphExplorer({
  demoDataset,
  confirmedDataset,
}: GraphExplorerProps) {
  const [scope, setScope] = useState<GraphScope>("demo");
  const dataset = scope === "demo" ? demoDataset : confirmedDataset;
  const [enabledKinds, setEnabledKinds] = useState<ReadonlySet<GraphNodeKind>>(
    () => new Set(GRAPH_KIND_ORDER),
  );
  const [enabledRelationships, setEnabledRelationships] = useState<
    ReadonlySet<GraphRelationshipKind>
  >(() => new Set(GRAPH_RELATIONSHIP_ORDER));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialNodeId(demoDataset),
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);

  const visibleDataset = useMemo(() => {
    const nodes = dataset.nodes.filter((node) => enabledKinds.has(node.kind));
    const nodeIds = new Set(nodes.map(({ id }) => id));
    const links = dataset.links.filter(
      (link) =>
        enabledRelationships.has(link.kind) &&
        nodeIds.has(link.source) &&
        nodeIds.has(link.target),
    );
    return { ...dataset, nodes, links } satisfies GraphDataset;
  }, [dataset, enabledKinds, enabledRelationships]);

  const selectedNode =
    dataset.nodes.find(({ id }) => id === selectedNodeId) ?? null;
  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (query === "") {
      return [];
    }
    return visibleDataset.nodes
      .filter((node) =>
        `${node.display} ${node.label} ${node.kind} ${node.id}`
          .toLocaleLowerCase()
          .includes(query),
      )
      .slice(0, 8);
  }, [search, visibleDataset.nodes]);

  const active = useMemo(
    () =>
      collectNeighborhood(
        hoveredNodeId ?? selectedNodeId,
        visibleDataset.nodes,
        visibleDataset.links,
      ),
    [
      hoveredNodeId,
      selectedNodeId,
      visibleDataset.links,
      visibleDataset.nodes,
    ],
  );

  const connectedNodes = useMemo(
    () =>
      selectedNode === null
        ? []
        : getConnectedNodes(selectedNode.id, dataset),
    [dataset, selectedNode],
  );

  useEffect(() => {
    const preferred = initialNodeId(dataset);
    setSelectedNodeId(preferred);
    setHoveredNodeId(null);
    setSearch("");
  }, [dataset]);

  const selectNode = (nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    if (nodeId !== null) {
      setSearch("");
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const first = searchResults[0];
    if (first !== undefined) {
      selectNode(first.id);
    }
  };

  const toggleKind = (kind: GraphNodeKind) => {
    setEnabledKinds((current) => toggledSet(current, kind));
  };

  const toggleRelationship = (kind: GraphRelationshipKind) => {
    setEnabledRelationships((current) => toggledSet(current, kind));
  };

  const resetFilters = () => {
    setEnabledKinds(new Set(GRAPH_KIND_ORDER));
    setEnabledRelationships(new Set(GRAPH_RELATIONSHIP_ORDER));
    setSearch("");
  };

  return (
    <main className="graph-explorer">
      <header className="graph-explorer__topbar">
        <div className="graph-explorer__title">
          <h1>Graph explorer</h1>
          <Info aria-hidden="true" />
          <p>
            {scope === "demo" ? (
              <>
                Demo data for exploration only. Not stored.{" "}
                <strong>Not a research finding.</strong>
              </>
            ) : (
              <>
                Human-confirmed review values only.{" "}
                <strong>Counts are not research findings.</strong>
              </>
            )}
          </p>
        </div>

        <div className="graph-explorer__top-actions">
          <Link href="/explore" className="graph-return-link" prefetch={false}>
            <LayoutList aria-hidden="true" />
            Reviewed clips
          </Link>
          <div className="graph-scope-switch" aria-label="Graph workspace">
            <button
              type="button"
              className={scope === "demo" ? "is-selected" : undefined}
              aria-pressed={scope === "demo"}
              onClick={() => setScope("demo")}
            >
              <FlaskConical aria-hidden="true" />
              Demo workspace
            </button>
            <button
              type="button"
              className={scope === "confirmed" ? "is-selected" : undefined}
              aria-pressed={scope === "confirmed"}
              onClick={() => setScope("confirmed")}
            >
              <Database aria-hidden="true" />
              Confirmed corpus
            </button>
          </div>
        </div>
      </header>

      <div
        className={`graph-explorer__workspace${
          filtersOpen ? "" : " graph-explorer__workspace--filters-closed"
        }${selectedNode === null ? " graph-explorer__workspace--no-inspector" : ""}`}
      >
        <aside
          className="graph-filters"
          aria-label="Graph filters and legend"
          hidden={!filtersOpen}
        >
          <div className="graph-panel-heading">
            <h2>Filter &amp; legend</h2>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              aria-label="Close graph filters"
            >
              <X aria-hidden="true" />
            </button>
          </div>

          <form className="graph-search" role="search" onSubmit={submitSearch}>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search labels…"
              aria-label="Search graph nodes"
              aria-controls="graph-search-results"
            />
            {searchResults.length > 0 ? (
              <div
                className="graph-search__results"
                id="graph-search-results"
                role="listbox"
              >
                {searchResults.map((node) => (
                  <button
                    type="button"
                    role="option"
                    onClick={() => selectNode(node.id)}
                    key={node.id}
                  >
                    <i
                      style={{ background: GRAPH_KIND_STYLE[node.kind].color }}
                      aria-hidden="true"
                    />
                    <span>{node.display}</span>
                    <small>{GRAPH_KIND_STYLE[node.kind].label}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </form>

          <FilterGroupHeading
            title="Labels"
            allSelected={enabledKinds.size === GRAPH_KIND_ORDER.length}
            onToggleAll={() =>
              setEnabledKinds(
                enabledKinds.size === GRAPH_KIND_ORDER.length
                  ? new Set()
                  : new Set(GRAPH_KIND_ORDER),
              )
            }
          />
          <div className="graph-filter-list">
            {GRAPH_KIND_ORDER.map((kind) => {
              const style = GRAPH_KIND_STYLE[kind];
              const count = dataset.nodes.filter(
                (node) => node.kind === kind,
              ).length;
              return (
                <label key={kind}>
                  <input
                    type="checkbox"
                    checked={enabledKinds.has(kind)}
                    onChange={() => toggleKind(kind)}
                  />
                  <i style={{ background: style.color }} aria-hidden="true" />
                  <span>{style.label}</span>
                  <small>{count}</small>
                  <Eye aria-hidden="true" />
                </label>
              );
            })}
          </div>

          <FilterGroupHeading
            title="Relationships"
            allSelected={
              enabledRelationships.size === GRAPH_RELATIONSHIP_ORDER.length
            }
            onToggleAll={() =>
              setEnabledRelationships(
                enabledRelationships.size ===
                  GRAPH_RELATIONSHIP_ORDER.length
                  ? new Set()
                  : new Set(GRAPH_RELATIONSHIP_ORDER),
              )
            }
          />
          <div className="graph-filter-list graph-filter-list--relationships">
            {GRAPH_RELATIONSHIP_ORDER.map((kind) => {
              const count = dataset.links.filter(
                (link) => link.kind === kind,
              ).length;
              return (
                <label key={kind}>
                  <input
                    type="checkbox"
                    checked={enabledRelationships.has(kind)}
                    onChange={() => toggleRelationship(kind)}
                  />
                  <span>{graphRelationshipLabel(kind)}</span>
                  <b aria-hidden="true">⟶</b>
                  <small>{count}</small>
                </label>
              );
            })}
          </div>

          <details className="graph-keyboard-list">
            <summary>
              <Network aria-hidden="true" />
              Browse nodes by keyboard
            </summary>
            <div>
              {visibleDataset.nodes.map((node) => (
                <button
                  type="button"
                  onClick={() => selectNode(node.id)}
                  aria-pressed={selectedNodeId === node.id}
                  key={node.id}
                >
                  <i
                    style={{ background: GRAPH_KIND_STYLE[node.kind].color }}
                    aria-hidden="true"
                  />
                  <span>{node.display}</span>
                  <small>{GRAPH_KIND_STYLE[node.kind].label}</small>
                </button>
              ))}
            </div>
          </details>

          <button
            type="button"
            className="graph-reset-filters"
            onClick={resetFilters}
          >
            <RotateCcw aria-hidden="true" />
            Reset filters
          </button>
        </aside>

        {!filtersOpen ? (
          <button
            type="button"
            className="graph-open-filters"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
          </button>
        ) : null}

        <GraphCanvas
          dataset={visibleDataset}
          selectedNodeId={selectedNodeId}
          activeNodeIds={active.nodeIds}
          activeLinkIds={active.linkIds}
          onSelectNode={selectNode}
          onHoverNode={setHoveredNodeId}
        />

        {selectedNode !== null ? (
          <NodeInspector
            node={selectedNode}
            connectedNodes={connectedNodes}
            demo={scope === "demo" || dataset.meta.demo_fixture}
            onClose={() => setSelectedNodeId(null)}
            onSelectNode={selectNode}
          />
        ) : null}
      </div>
    </main>
  );
}

interface FilterGroupHeadingProps {
  readonly title: string;
  readonly allSelected: boolean;
  readonly onToggleAll: () => void;
}

function FilterGroupHeading({
  title,
  allSelected,
  onToggleAll,
}: FilterGroupHeadingProps) {
  return (
    <div className="graph-filter-heading">
      <h3>{title}</h3>
      <button type="button" onClick={onToggleAll}>
        {allSelected ? "Clear all" : "Select all"}
      </button>
    </div>
  );
}

interface NodeInspectorProps {
  readonly node: GraphNode;
  readonly connectedNodes: readonly ConnectedNode[];
  readonly demo: boolean;
  readonly onClose: () => void;
  readonly onSelectNode: (nodeId: string) => void;
}

function NodeInspector({
  node,
  connectedNodes,
  demo,
  onClose,
  onSelectNode,
}: NodeInspectorProps) {
  const style = GRAPH_KIND_STYLE[node.kind];
  const clipConnections = connectedNodes.filter(
    ({ node: connected }) => connected.kind === "Clip",
  );
  const otherConnections = connectedNodes.filter(
    ({ node: connected }) => connected.kind !== "Clip",
  );
  const properties = Object.entries(node.properties);

  return (
    <aside className="graph-inspector" aria-label="Selected graph node">
      <div className="graph-panel-heading">
        <h2>
          {style.label} <span>{node.display}</span>
        </h2>
        <button type="button" onClick={onClose} aria-label="Close node details">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="graph-inspector__identity">
        <div
          style={{ background: style.color, boxShadow: `0 8px 22px ${style.color}45` }}
          aria-hidden="true"
        >
          {node.kind === "Particle" ? node.display : style.glyph}
        </div>
        <dl>
          <div>
            <dt>Label</dt>
            <dd>{node.label}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{style.label}</dd>
          </div>
        </dl>
      </div>

      {demo ? (
        <div className="graph-fixture-notice">
          <Info aria-hidden="true" />
          <p>
            <strong>Demo fixture — not a research finding.</strong>
            <span>For exploration and workflow demonstration only.</span>
          </p>
        </div>
      ) : null}

      {clipConnections.length > 0 ? (
        <InspectorConnectionGroup
          title={`Connected clips (${clipConnections.length})`}
          connections={clipConnections}
          onSelectNode={onSelectNode}
        />
      ) : null}

      {node.href !== null ? (
        <Link
          href={node.href}
          className="graph-view-evidence"
          prefetch={false}
        >
          View evidence
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : clipConnections[0]?.node.href !== null &&
        clipConnections[0]?.node.href !== undefined ? (
        <Link
          href={clipConnections[0].node.href}
          className="graph-view-evidence"
          prefetch={false}
        >
          View connected evidence
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}

      {otherConnections.length > 0 ? (
        <InspectorConnectionGroup
          title={`Connected nodes (${otherConnections.length})`}
          connections={otherConnections}
          compact
          onSelectNode={onSelectNode}
        />
      ) : null}

      <section className="graph-properties">
        <h3>Properties</h3>
        <dl>
          <div>
            <dt>ID</dt>
            <dd>{node.id}</dd>
          </div>
          {properties.map(([key, value]) => (
            <div key={key}>
              <dt>{humanizeGraphValue(key)}</dt>
              <dd>{formatGraphProperty(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}

interface ConnectedNode {
  readonly node: GraphNode;
  readonly relationship: string;
}

interface InspectorConnectionGroupProps {
  readonly title: string;
  readonly connections: readonly ConnectedNode[];
  readonly compact?: boolean;
  readonly onSelectNode: (nodeId: string) => void;
}

function InspectorConnectionGroup({
  title,
  connections,
  compact = false,
  onSelectNode,
}: InspectorConnectionGroupProps) {
  return (
    <section
      className={`graph-connections${compact ? " graph-connections--compact" : ""}`}
    >
      <h3>{title}</h3>
      <div>
        {connections.map(({ node, relationship }) => (
          <button
            type="button"
            onClick={() => onSelectNode(node.id)}
            key={`${node.id}:${relationship}`}
          >
            <i
              style={{ background: GRAPH_KIND_STYLE[node.kind].color }}
              aria-hidden="true"
            />
            <span>{node.display}</span>
            <small>{relationship}</small>
            <ArrowRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function collectNeighborhood(
  anchorId: string | null,
  nodes: readonly GraphNode[],
  links: GraphDataset["links"],
): {
  readonly nodeIds: ReadonlySet<string>;
  readonly linkIds: ReadonlySet<string>;
} {
  if (anchorId === null || !nodes.some(({ id }) => id === anchorId)) {
    return { nodeIds: new Set(), linkIds: new Set() };
  }
  const nodeIds = new Set([anchorId]);
  const linkIds = new Set<string>();
  for (const link of links) {
    if (link.source === anchorId || link.target === anchorId) {
      nodeIds.add(link.source);
      nodeIds.add(link.target);
      linkIds.add(link.id);
    }
  }
  return { nodeIds, linkIds };
}

function getConnectedNodes(
  nodeId: string,
  dataset: GraphDataset,
): readonly ConnectedNode[] {
  const nodesById = new Map(dataset.nodes.map((node) => [node.id, node]));
  const connected: ConnectedNode[] = [];
  for (const link of dataset.links) {
    const otherId =
      link.source === nodeId
        ? link.target
        : link.target === nodeId
          ? link.source
          : null;
    if (otherId === null) {
      continue;
    }
    const node = nodesById.get(otherId);
    if (node !== undefined) {
      connected.push({
        node,
        relationship: graphRelationshipLabel(link.kind),
      });
    }
  }
  return connected.sort((left, right) => {
    if (left.node.kind === "Clip" && right.node.kind !== "Clip") {
      return -1;
    }
    if (left.node.kind !== "Clip" && right.node.kind === "Clip") {
      return 1;
    }
    return left.node.display.localeCompare(right.node.display);
  });
}

function initialNodeId(dataset: GraphDataset): string | null {
  return (
    dataset.nodes.find(
      ({ kind, display }) => kind === "Particle" && display === "吗",
    )?.id ??
    dataset.nodes.find(({ kind }) => kind === "Particle")?.id ??
    dataset.nodes.find(({ kind }) => kind === "Clip")?.id ??
    dataset.nodes[0]?.id ??
    null
  );
}

function toggledSet<Value>(
  current: ReadonlySet<Value>,
  value: Value,
): ReadonlySet<Value> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function formatGraphProperty(value: GraphPropertyValue): string {
  if (value === null) {
    return "Not recorded";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatGraphProperty(item)).join(", ");
  }
  return JSON.stringify(value);
}
