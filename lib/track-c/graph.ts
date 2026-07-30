import type { TimeRange } from "../types.ts";
import type {
  ClipDetail,
  ReviewField,
  ReviewFieldState,
  Suggestion,
} from "./types.ts";

export type GraphScope = "demo" | "confirmed";

export const GRAPH_NODE_KINDS = [
  "Video",
  "Utterance",
  "Clip",
  "Speaker",
  "Particle",
  "Gesture",
  "SentenceType",
  "Tone",
  "CommunicativeFunction",
] as const;

export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

export const GRAPH_RELATIONSHIP_KINDS = [
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
] as const;

export type GraphRelationshipKind =
  (typeof GRAPH_RELATIONSHIP_KINDS)[number];

type GraphPrimitive = string | number | boolean | null;

export interface GraphPropertyObject {
  readonly [key: string]: GraphPropertyValue;
}

export type GraphPropertyValue =
  | GraphPrimitive
  | readonly GraphPropertyValue[]
  | GraphPropertyObject;

export interface GraphNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly display: string;
  readonly label: string;
  readonly href: string | null;
  readonly properties: Readonly<Record<string, GraphPropertyValue>>;
}

export interface GraphLink {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: GraphRelationshipKind;
  readonly instance_id: string | null;
  readonly properties: Readonly<Record<string, GraphPropertyValue>>;
}

export interface GraphDataset {
  readonly meta: {
    readonly scope: GraphScope;
    readonly source: "demo" | "corpus";
    readonly demo_fixture: boolean;
    readonly confirmed_only: boolean;
    readonly truncated: boolean;
    readonly unique_clip_count: number;
    readonly unique_video_count: number;
    readonly particle_instance_count: number;
  };
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
}

interface ProjectedField<T> {
  readonly value: T;
  readonly state: ReviewFieldState;
  readonly suggestion: Suggestion<T>;
  readonly review: ReviewField<T>["review"];
}

/**
 * Builds the browser-safe display graph from Track C review records.
 *
 * The confirmed projection never falls back to a model suggestion. Demo mode
 * may show unresolved working values, but every node remains inside an
 * explicitly labelled fixture dataset and retains suggestion provenance on
 * its relationship.
 */
export function buildGraphDataset(
  clips: readonly ClipDetail[],
  scope: GraphScope,
): GraphDataset {
  const includedClips = clips.filter((clip) =>
    scope === "confirmed"
      ? clip.clip.status === "confirmed"
      : clip.demo_fixture && clip.clip.status !== "rejected",
  );
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();

  const addNode = (node: GraphNode) => {
    const existing = nodes.get(node.id);
    if (existing === undefined) {
      nodes.set(node.id, node);
      return;
    }
    if (existing.kind !== node.kind) {
      throw new Error(
        `graph node ${node.id} was projected with conflicting labels`,
      );
    }
    nodes.set(node.id, {
      ...existing,
      properties: { ...existing.properties, ...node.properties },
    });
  };

  const addLink = (link: GraphLink) => {
    if (links.has(link.id)) {
      throw new Error(`duplicate graph relationship id ${link.id}`);
    }
    if (!nodes.has(link.source) || !nodes.has(link.target)) {
      throw new Error(`graph relationship ${link.id} has a missing endpoint`);
    }
    links.set(link.id, link);
  };

  for (const clip of includedClips) {
    const videoNodeId = graphNodeId("Video", clip.video.id);
    const utteranceKey = `${clip.video.id}:${clip.utterance.id}`;
    const utteranceNodeId = graphNodeId("Utterance", utteranceKey);
    const clipNodeId = graphNodeId("Clip", clip.clip.id);

    addNode({
      id: videoNodeId,
      kind: "Video",
      display: clip.video.id,
      label: clip.video.id,
      href: null,
      properties: {
        video_id: clip.video.id,
        duration_ms: clip.video.duration_ms,
        fps: clip.video.fps,
        source_url: clip.video.source_url,
        demo_fixture: clip.demo_fixture,
      },
    });
    addNode({
      id: utteranceNodeId,
      kind: "Utterance",
      display: clip.utterance.text,
      label: clip.utterance.id,
      href: null,
      properties: {
        video_id: clip.video.id,
        utterance_id: clip.utterance.id,
        text: clip.utterance.text,
        demo_fixture: clip.demo_fixture,
      },
    });
    addNode({
      id: clipNodeId,
      kind: "Clip",
      display: clip.clip.name,
      label: clip.clip.id,
      href: `/clips/${encodeURIComponent(clip.clip.id)}`,
      properties: {
        video_id: clip.video.id,
        status: clip.clip.status,
        start_ms: clip.clip.start_ms,
        end_ms: clip.clip.end_ms,
        duration_ms: clip.clip.end_ms - clip.clip.start_ms,
        fp_count: clip.particle_instances.length,
        demo_fixture: clip.demo_fixture,
      },
    });

    addLink(
      structuralLink(
        "HAS_UTTERANCE",
        videoNodeId,
        utteranceNodeId,
        utteranceKey,
        clip,
      ),
    );
    addLink(
      structuralLink(
        "HAS_CLIP",
        videoNodeId,
        clipNodeId,
        clip.clip.id,
        clip,
      ),
    );
    addLink(
      structuralLink(
        "FROM_UTTERANCE",
        clipNodeId,
        utteranceNodeId,
        clip.clip.id,
        clip,
      ),
    );

    projectParticipant(
      clip,
      clipNodeId,
      "SPOKEN_BY",
      clip.fields.speaker_id,
      "speaker",
      scope,
      addNode,
      addLink,
    );
    projectParticipant(
      clip,
      clipNodeId,
      "ADDRESSED_TO",
      clip.fields.addressee_id,
      "addressee",
      scope,
      addNode,
      addLink,
    );

    const sentenceType = projectField(clip.fields.sentence_type, scope);
    if (sentenceType !== null) {
      const nodeId = graphNodeId("SentenceType", sentenceType.value);
      addNode({
        id: nodeId,
        kind: "SentenceType",
        display: humanize(sentenceType.value),
        label: sentenceType.value,
        href: null,
        properties: { label: sentenceType.value },
      });
      addLink({
        id: graphLinkId("CLASSIFIED_AS", clipNodeId, nodeId, clip.clip.id),
        source: clipNodeId,
        target: nodeId,
        kind: "CLASSIFIED_AS",
        instance_id: null,
        properties: fieldProvenance("sentence_type", sentenceType),
      });
    }

    const tone = projectField(clip.fields.tone_contour, scope);
    if (tone !== null) {
      const nodeId = graphNodeId("Tone", tone.value);
      addNode({
        id: nodeId,
        kind: "Tone",
        display: humanize(tone.value),
        label: tone.value,
        href: null,
        properties: { contour: tone.value },
      });
      addLink({
        id: graphLinkId("HAS_TONE", clipNodeId, nodeId, clip.clip.id),
        source: clipNodeId,
        target: nodeId,
        kind: "HAS_TONE",
        instance_id: null,
        properties: fieldProvenance("tone_contour", tone),
      });
    }

    const meaning = projectField(
      clip.fields.communicative_function,
      scope,
    );
    if (meaning !== null) {
      const nodeId = graphNodeId("CommunicativeFunction", meaning.value);
      addNode({
        id: nodeId,
        kind: "CommunicativeFunction",
        display: humanize(meaning.value),
        label: meaning.value,
        href: null,
        properties: { label: meaning.value },
      });
      const explanation = projectField(
        clip.fields.meaning_explanation,
        scope,
      );
      addLink({
        id: graphLinkId("INTERPRETED_AS", clipNodeId, nodeId, clip.clip.id),
        source: clipNodeId,
        target: nodeId,
        kind: "INTERPRETED_AS",
        instance_id: null,
        properties: {
          ...fieldProvenance("communicative_function", meaning),
          ...(explanation === null
            ? {}
            : fieldProvenance("meaning_explanation", explanation)),
        },
      });
    }

    for (const particle of clip.particle_instances) {
      const particleToken = projectField(particle.fields.fp_token, scope);
      if (particleToken !== null) {
        const nodeId = graphNodeId("Particle", particleToken.value);
        const timing = projectField(particle.fields.fp_timing, scope);
        addNode({
          id: nodeId,
          kind: "Particle",
          display: particleToken.value,
          label: particleToken.value,
          href: null,
          properties: {
            token: particleToken.value,
            pinyin: particle.fp_pinyin,
          },
        });
        addLink({
          id: graphLinkId(
            "CONTAINS_PARTICLE",
            clipNodeId,
            nodeId,
            particle.instance_id,
          ),
          source: clipNodeId,
          target: nodeId,
          kind: "CONTAINS_PARTICLE",
          instance_id: particle.instance_id,
          properties: {
            instance_id: particle.instance_id,
            video_id: clip.video.id,
            surface_form: particle.surface_form,
            pinyin: particle.fp_pinyin,
            ...fieldProvenance("fp_token", particleToken),
            ...(timing === null
              ? {}
              : {
                  start_ms: timing.value.start_ms,
                  end_ms: timing.value.end_ms,
                  ...timeRangeProvenance("fp_timing", timing),
                }),
          },
        });
      }

      const gesturePresent = projectField(
        particle.fields.gesture_present,
        scope,
      );
      const gestureType = projectField(particle.fields.gesture_type, scope);
      const gestureRegion = projectField(
        particle.fields.gesture_region,
        scope,
      );
      if (
        gesturePresent !== null &&
        gestureType !== null &&
        (gesturePresent.value === false || gestureRegion !== null)
      ) {
        const type = gesturePresent.value ? gestureType.value : "none";
        const region =
          gesturePresent.value && gestureRegion !== null
            ? gestureRegion.value
            : null;
        const gestureKey = `${type}:${region ?? "none"}`;
        const nodeId = graphNodeId("Gesture", gestureKey);
        const timing = projectField(particle.fields.gesture_timing, scope);
        addNode({
          id: nodeId,
          kind: "Gesture",
          display: type === "none" ? "No gesture" : humanize(type),
          label: type,
          href: null,
          properties: {
            type,
            region,
            gesture_present: gesturePresent.value,
          },
        });
        addLink({
          id: graphLinkId(
            "ACCOMPANIED_BY",
            clipNodeId,
            nodeId,
            particle.instance_id,
          ),
          source: clipNodeId,
          target: nodeId,
          kind: "ACCOMPANIED_BY",
          instance_id: particle.instance_id,
          properties: {
            instance_id: particle.instance_id,
            video_id: clip.video.id,
            gesture_present: gesturePresent.value,
            ...fieldProvenance("gesture_present", gesturePresent),
            ...fieldProvenance("gesture_type", gestureType),
            ...(gestureRegion === null
              ? {}
              : fieldProvenance("gesture_region", gestureRegion)),
            ...(timing === null || timing.value === null
              ? {}
              : {
                  start_ms: timing.value.start_ms,
                  end_ms: timing.value.end_ms,
                  ...timeRangeProvenance("gesture_timing", timing),
                }),
          },
        });
      }
    }
  }

  const projectedNodes = Array.from(nodes.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const projectedLinks = Array.from(links.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    meta: {
      scope,
      source: scope === "demo" ? "demo" : "corpus",
      demo_fixture:
        includedClips.length > 0 &&
        includedClips.every(({ demo_fixture }) => demo_fixture),
      confirmed_only: scope === "confirmed",
      truncated: false,
      unique_clip_count: projectedNodes.filter(({ kind }) => kind === "Clip")
        .length,
      unique_video_count: projectedNodes.filter(({ kind }) => kind === "Video")
        .length,
      particle_instance_count: projectedLinks.filter(
        ({ kind }) => kind === "CONTAINS_PARTICLE",
      ).length,
    },
    nodes: projectedNodes,
    links: projectedLinks,
  };
}

export function graphNodeId(kind: GraphNodeKind, domainId: string): string {
  return `${kind}:${domainId}`;
}

function projectParticipant(
  clip: ClipDetail,
  clipNodeId: string,
  relationship: "SPOKEN_BY" | "ADDRESSED_TO",
  field: ReviewField<string>,
  propertyPrefix: "speaker" | "addressee",
  scope: GraphScope,
  addNode: (node: GraphNode) => void,
  addLink: (link: GraphLink) => void,
) {
  const projected = projectField(field, scope);
  if (projected === null) {
    return;
  }
  const participant = clip.participant_options.find(
    ({ id }) => id === projected.value,
  );
  const participantKey = `${clip.video.id}:${projected.value}`;
  const nodeId = graphNodeId("Speaker", participantKey);
  addNode({
    id: nodeId,
    kind: "Speaker",
    display: participant?.label ?? projected.value,
    label: projected.value,
    href: null,
    properties: {
      key: participantKey,
      speaker_id: projected.value,
      video_id: clip.video.id,
      region: participant?.region ?? null,
      region_source: participant?.region_source ?? null,
      region_confirmed: participant?.region_confirmed ?? false,
    },
  });
  addLink({
    id: graphLinkId(
      relationship,
      clipNodeId,
      nodeId,
      `${clip.clip.id}:${propertyPrefix}`,
    ),
    source: clipNodeId,
    target: nodeId,
    kind: relationship,
    instance_id: null,
    properties: fieldProvenance(propertyPrefix, projected),
  });
}

function projectField<T>(
  field: ReviewField<T>,
  scope: GraphScope,
): ProjectedField<T> | null {
  if (
    field.state === "skipped" ||
    field.value === null ||
    (scope === "confirmed" && field.state !== "confirmed")
  ) {
    return null;
  }
  return {
    value: field.value,
    state: field.state,
    suggestion: field.suggestion,
    review: field.review,
  };
}

function structuralLink(
  kind: "HAS_UTTERANCE" | "HAS_CLIP" | "FROM_UTTERANCE",
  source: string,
  target: string,
  suffix: string,
  clip: ClipDetail,
): GraphLink {
  return {
    id: graphLinkId(kind, source, target, suffix),
    source,
    target,
    kind,
    instance_id: null,
    properties: {
      video_id: clip.video.id,
      clip_status: clip.clip.status,
      demo_fixture: clip.demo_fixture,
    },
  };
}

function graphLinkId(
  kind: GraphRelationshipKind,
  source: string,
  target: string,
  suffix: string,
): string {
  return `${kind}:${source}->${target}:${suffix}`;
}

function fieldProvenance<T>(
  prefix: string,
  field: ProjectedField<T>,
): Readonly<Record<string, GraphPropertyValue>> {
  return {
    [`${prefix}_review_state`]: field.state,
    [`${prefix}_value`]: toGraphProperty(field.value),
    [`${prefix}_suggested_value`]: toGraphProperty(field.suggestion.value),
    [`${prefix}_suggestion_source`]: field.suggestion.source,
    [`${prefix}_suggestion_confidence`]: field.suggestion.confidence,
    [`${prefix}_review_action`]: field.review?.action ?? null,
    [`${prefix}_reviewer_id`]: field.review?.reviewer_id ?? null,
    [`${prefix}_reviewed_at`]: field.review?.reviewed_at ?? null,
  };
}

function timeRangeProvenance(
  prefix: string,
  field: ProjectedField<TimeRange | null>,
): Readonly<Record<string, GraphPropertyValue>> {
  const suggested = field.suggestion.value;
  return {
    [`${prefix}_review_state`]: field.state,
    [`${prefix}_suggested_start_ms`]: suggested?.start_ms ?? null,
    [`${prefix}_suggested_end_ms`]: suggested?.end_ms ?? null,
    [`${prefix}_suggestion_source`]: field.suggestion.source,
    [`${prefix}_suggestion_confidence`]: field.suggestion.confidence,
    [`${prefix}_review_action`]: field.review?.action ?? null,
    [`${prefix}_reviewer_id`]: field.review?.reviewer_id ?? null,
    [`${prefix}_reviewed_at`]: field.review?.reviewed_at ?? null,
  };
}

function toGraphProperty(value: unknown): GraphPropertyValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (Array.isArray(value)) {
    return value.map(toGraphProperty);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        toGraphProperty(item),
      ]),
    );
  }
  return String(value);
}

function humanize(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
