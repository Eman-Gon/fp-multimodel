"use client";

import dynamic from "next/dynamic";
import {
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ForceGraphMethods,
  LinkObject,
  NodeObject,
} from "react-force-graph-2d";
import type {
  GraphDataset,
  GraphLink,
  GraphNode,
} from "@/lib/track-c/graph.ts";
import {
  GRAPH_KIND_STYLE,
  graphRelationshipLabel,
} from "./graph-visuals.ts";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="graph-canvas__loading" role="status">
      Arranging graph…
    </div>
  ),
});

type CanvasNode = NodeObject<GraphNode>;
type CanvasLink = LinkObject<GraphNode, GraphLink>;

interface GraphCanvasProps {
  readonly dataset: GraphDataset;
  readonly selectedNodeId: string | null;
  readonly activeNodeIds: ReadonlySet<string>;
  readonly activeLinkIds: ReadonlySet<string>;
  readonly onSelectNode: (nodeId: string | null) => void;
  readonly onHoverNode: (nodeId: string | null) => void;
}

export function GraphCanvas({
  dataset,
  selectedNodeId,
  activeNodeIds,
  activeLinkIds,
  onSelectNode,
  onHoverNode,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 800, height: 640 });
  const [paused, setPaused] = useState(false);
  const [engineRunning, setEngineRunning] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const hasFit = useRef(false);
  const canvasData = useMemo<{
    readonly nodes: CanvasNode[];
    readonly links: CanvasLink[];
  }>(
    () => ({
      nodes: dataset.nodes.map((node) => ({ ...node }) as CanvasNode),
      links: dataset.links.map((link) => ({ ...link }) as CanvasLink),
    }),
    [dataset],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const updateSize = () => {
      const bounds = container.getBoundingClientRect();
      setSize({
        width: Math.max(320, Math.round(bounds.width)),
        height: Math.max(440, Math.round(bounds.height)),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    hasFit.current = false;
    setEngineRunning(true);
    setPaused(false);
  }, [dataset]);

  useEffect(() => {
    if (selectedNodeId === null) {
      return;
    }
    const node = canvasData.nodes.find(({ id }) => id === selectedNodeId);
    if (
      node === undefined ||
      typeof node.x !== "number" ||
      typeof node.y !== "number"
    ) {
      return;
    }
    const duration = reduceMotion ? 0 : 320;
    graphRef.current?.centerAt(node.x, node.y, duration);
    graphRef.current?.zoom(Math.max(graphRef.current.zoom(), 1.7), duration);
  }, [canvasData.nodes, reduceMotion, selectedNodeId]);

  const zoomBy = (factor: number) => {
    const graph = graphRef.current;
    if (graph === undefined) {
      return;
    }
    graph.zoom(graph.zoom() * factor, reduceMotion ? 0 : 180);
  };

  const fitGraph = () => {
    graphRef.current?.zoomToFit(reduceMotion ? 0 : 360, 48);
  };

  const togglePaused = () => {
    const graph = graphRef.current;
    if (graph === undefined) {
      return;
    }
    if (paused) {
      graph.resumeAnimation();
      graph.d3ReheatSimulation();
      setEngineRunning(true);
    } else {
      graph.pauseAnimation();
      setEngineRunning(false);
    }
    setPaused((current) => !current);
  };

  return (
    <div className="graph-canvas" ref={containerRef}>
      {dataset.nodes.length === 0 ? (
        <div className="graph-canvas__empty">
          <strong>No nodes in this view</strong>
          <span>Change a filter or switch graph workspace.</span>
        </div>
      ) : (
        <ForceGraph2D
          ref={graphRef}
          graphData={canvasData}
          nodeId="id"
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          minZoom={0.35}
          maxZoom={8}
          warmupTicks={reduceMotion ? 90 : 24}
          cooldownTicks={reduceMotion ? 1 : 180}
          d3AlphaDecay={0.035}
          d3VelocityDecay={0.32}
          nodeRelSize={1}
          nodeVal={(rawNode) => {
            const node = rawNode as CanvasNode;
            return GRAPH_KIND_STYLE[node.kind].radius;
          }}
          nodeLabel={(rawNode) => {
            const node = rawNode as CanvasNode;
            return `${GRAPH_KIND_STYLE[node.kind].label}: ${node.display}`;
          }}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(rawNode, context, scale) =>
            paintNode(
              rawNode as CanvasNode,
              context,
              scale,
              selectedNodeId,
              activeNodeIds,
            )
          }
          nodePointerAreaPaint={(rawNode, color, context) => {
            const node = rawNode as CanvasNode;
            const radius = GRAPH_KIND_STYLE[node.kind].radius + 4;
            context.fillStyle = color;
            context.beginPath();
            context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
            context.fill();
          }}
          linkColor={(rawLink) => {
            const link = rawLink as CanvasLink;
            if (activeLinkIds.size === 0) {
              return "rgba(77, 95, 119, 0.54)";
            }
            return activeLinkIds.has(link.id ?? "")
              ? "rgba(39, 59, 86, 0.92)"
              : "rgba(112, 127, 148, 0.12)";
          }}
          linkWidth={(rawLink) => {
            const link = rawLink as CanvasLink;
            return activeLinkIds.has(link.id ?? "") ? 1.7 : 0.85;
          }}
          linkLineDash={(rawLink) => {
            const link = rawLink as CanvasLink;
            return link.kind === "ADDRESSED_TO" ? [4, 3] : null;
          }}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.9}
          linkDirectionalArrowColor={(rawLink) => {
            const link = rawLink as CanvasLink;
            return activeLinkIds.size === 0 ||
              activeLinkIds.has(link.id ?? "")
              ? "rgba(61, 78, 101, 0.76)"
              : "rgba(112, 127, 148, 0.12)";
          }}
          linkLabel={(rawLink) => {
            const link = rawLink as CanvasLink;
            return graphRelationshipLabel(link.kind);
          }}
          linkCanvasObjectMode={() => "after"}
          linkCanvasObject={(rawLink, context, scale) =>
            paintLinkLabel(
              rawLink as CanvasLink,
              context,
              scale,
              activeLinkIds,
            )
          }
          onNodeHover={(rawNode) => {
            const node = rawNode as CanvasNode | null;
            onHoverNode(node?.id === undefined ? null : String(node.id));
          }}
          onNodeClick={(rawNode) => {
            const node = rawNode as CanvasNode;
            onSelectNode(node.id === undefined ? null : String(node.id));
          }}
          onNodeDragEnd={(rawNode) => {
            const node = rawNode as CanvasNode;
            if (typeof node.x === "number" && typeof node.y === "number") {
              node.fx = node.x;
              node.fy = node.y;
            }
          }}
          onNodeRightClick={(rawNode, event) => {
            event.preventDefault();
            const node = rawNode as CanvasNode;
            delete node.fx;
            delete node.fy;
            graphRef.current?.d3ReheatSimulation();
          }}
          onBackgroundClick={() => onSelectNode(null)}
          onEngineTick={() => {
            if (!engineRunning && !paused) {
              setEngineRunning(true);
            }
          }}
          onEngineStop={() => {
            setEngineRunning(false);
            if (!hasFit.current) {
              hasFit.current = true;
              fitGraph();
            }
          }}
        />
      )}

      <div className="graph-canvas__controls" aria-label="Graph canvas controls">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          <Plus aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.8)}
          aria-label="Zoom out"
        >
          <Minus aria-hidden="true" />
        </button>
        <button type="button" onClick={fitGraph} aria-label="Fit graph to view">
          <Maximize2 aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={togglePaused}
          aria-label={paused ? "Resume graph motion" : "Pause graph motion"}
          aria-pressed={paused}
        >
          {paused ? (
            <Play aria-hidden="true" />
          ) : (
            <Pause aria-hidden="true" />
          )}
        </button>
        <span>
          <i
            className={engineRunning && !paused ? "is-running" : undefined}
            aria-hidden="true"
          />
          {paused
            ? "Layout paused"
            : engineRunning
              ? "Auto-layout running"
              : "Layout settled"}
        </span>
      </div>

      <div className="graph-canvas__counts" aria-live="polite">
        <span>Nodes {dataset.nodes.length}</span>
        <span>Relationships {dataset.links.length}</span>
      </div>
    </div>
  );
}

function paintNode(
  node: CanvasNode,
  context: CanvasRenderingContext2D,
  scale: number,
  selectedNodeId: string | null,
  activeNodeIds: ReadonlySet<string>,
) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const style = GRAPH_KIND_STYLE[node.kind];
  const radius = style.radius;
  const isSelected = node.id === selectedNodeId;
  const isActive = activeNodeIds.size === 0 || activeNodeIds.has(String(node.id));
  const opacity = isActive ? 1 : 0.15;

  context.save();
  context.globalAlpha = opacity;
  context.shadowColor = `${style.color}42`;
  context.shadowBlur = isSelected ? 16 : 7;
  context.fillStyle = style.soft;
  context.strokeStyle = style.color;
  context.lineWidth = isSelected ? 2.6 : 1.25;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  if (isSelected) {
    context.shadowBlur = 0;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2.2;
    context.beginPath();
    context.arc(x, y, radius + 3.2, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = style.color;
    context.lineWidth = 0.9;
    context.beginPath();
    context.arc(x, y, radius + 5.2, 0, Math.PI * 2);
    context.stroke();
  }

  context.shadowBlur = 0;
  context.fillStyle = node.kind === "Particle" ? style.color : "#122033";
  const glyph =
    node.kind === "Particle"
      ? node.display.slice(0, 2)
      : GRAPH_KIND_STYLE[node.kind].glyph;
  const glyphSize = node.kind === "Particle" ? 10 : 6.5;
  context.font = `650 ${glyphSize}px Inter, "Noto Sans SC", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(glyph, x, y + 0.2);

  const label = shorten(node.display, node.kind === "Particle" ? 13 : 18);
  const labelSize = Math.max(3.1, Math.min(5.1, 10 / scale));
  context.fillStyle = "#121a28";
  context.font = `600 ${labelSize}px Inter, "Noto Sans SC", sans-serif`;
  context.textBaseline = "top";
  context.fillText(label, x, y + radius + 3, radius * 4);
  context.restore();
}

function paintLinkLabel(
  link: CanvasLink,
  context: CanvasRenderingContext2D,
  scale: number,
  activeLinkIds: ReadonlySet<string>,
) {
  if (
    activeLinkIds.size > 0 &&
    !activeLinkIds.has(link.id === undefined ? "" : String(link.id))
  ) {
    return;
  }
  const source = endpointNode(link.source);
  const target = endpointNode(link.target);
  if (
    source === null ||
    target === null ||
    typeof source.x !== "number" ||
    typeof source.y !== "number" ||
    typeof target.x !== "number" ||
    typeof target.y !== "number"
  ) {
    return;
  }
  if (scale < 0.9 && activeLinkIds.size === 0) {
    return;
  }

  const label = graphRelationshipLabel(link.kind);
  const x = (source.x + target.x) / 2;
  const y = (source.y + target.y) / 2;
  const fontSize = Math.max(2.7, Math.min(4.3, 9 / scale));

  context.save();
  context.font = `500 ${fontSize}px Inter, sans-serif`;
  const width = context.measureText(label).width + 3;
  context.fillStyle = "rgba(247, 250, 253, 0.88)";
  context.fillRect(x - width / 2, y - fontSize * 0.62, width, fontSize * 1.25);
  context.fillStyle = "#536176";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x, y);
  context.restore();
}

function endpointNode(
  endpoint: CanvasLink["source"] | CanvasLink["target"],
): CanvasNode | null {
  return typeof endpoint === "object" && endpoint !== null
    ? (endpoint as CanvasNode)
    : null;
}

function shorten(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
