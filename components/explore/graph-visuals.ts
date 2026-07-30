import type {
  GraphNodeKind,
  GraphRelationshipKind,
} from "@/lib/track-c/graph.ts";

interface GraphKindStyle {
  readonly color: string;
  readonly soft: string;
  readonly label: string;
  readonly glyph: string;
  readonly radius: number;
}

export const GRAPH_KIND_ORDER: readonly GraphNodeKind[] = [
  "Video",
  "Utterance",
  "Clip",
  "Speaker",
  "Particle",
  "Gesture",
  "SentenceType",
  "Tone",
  "CommunicativeFunction",
];

export const GRAPH_KIND_STYLE: Readonly<
  Record<GraphNodeKind, GraphKindStyle>
> = {
  Video: {
    color: "#0797aa",
    soft: "#e0f7fa",
    label: "Video",
    glyph: "▶",
    radius: 10,
  },
  Utterance: {
    color: "#3979dc",
    soft: "#e8f1ff",
    label: "Utterance",
    glyph: "“”",
    radius: 9,
  },
  Clip: {
    color: "#7951d6",
    soft: "#efe9ff",
    label: "Clip",
    glyph: "▦",
    radius: 11,
  },
  Speaker: {
    color: "#f06c2b",
    soft: "#fff0e8",
    label: "Speaker",
    glyph: "○",
    radius: 11,
  },
  Particle: {
    color: "#ff4f42",
    soft: "#ffebe9",
    label: "Particle",
    glyph: "字",
    radius: 17,
  },
  Gesture: {
    color: "#18a453",
    soft: "#e5f7eb",
    label: "Gesture",
    glyph: "✦",
    radius: 11,
  },
  SentenceType: {
    color: "#6267e8",
    soft: "#ececff",
    label: "Sentence type",
    glyph: "?",
    radius: 11,
  },
  Tone: {
    color: "#e3a40c",
    soft: "#fff6d9",
    label: "Tone",
    glyph: "∿",
    radius: 11,
  },
  CommunicativeFunction: {
    color: "#9a5938",
    soft: "#f5e9e3",
    label: "Meaning",
    glyph: "→",
    radius: 12,
  },
};

export const GRAPH_RELATIONSHIP_ORDER: readonly GraphRelationshipKind[] = [
  "HAS_UTTERANCE",
  "HAS_CLIP",
  "FROM_UTTERANCE",
  "SPOKEN_BY",
  "ADDRESSED_TO",
  "CONTAINS_PARTICLE",
  "ACCOMPANIED_BY",
  "CLASSIFIED_AS",
  "HAS_TONE",
  "INTERPRETED_AS",
];

export function humanizeGraphValue(value: string): string {
  const words = value.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function graphRelationshipLabel(
  kind: GraphRelationshipKind,
): string {
  switch (kind) {
    case "HAS_UTTERANCE":
    case "HAS_CLIP":
      return "contains";
    case "FROM_UTTERANCE":
      return "from utterance";
    case "SPOKEN_BY":
      return "spoken by";
    case "ADDRESSED_TO":
      return "addressed to";
    case "CONTAINS_PARTICLE":
      return "uses";
    case "ACCOMPANIED_BY":
      return "performed with";
    case "CLASSIFIED_AS":
      return "sentence type";
    case "HAS_TONE":
      return "has tone";
    case "INTERPRETED_AS":
      return "conveys";
  }
}
