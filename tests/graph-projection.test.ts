import assert from "node:assert/strict";
import test from "node:test";
import { buildGraphDataset } from "../lib/track-c/graph.ts";
import { applyClipCommand, listReviewUnits } from "../lib/track-c/review.ts";
import {
  createDemoClip,
  createDemoClips,
  createSecondDemoClip,
} from "../lib/track-c/seed.ts";
import type { TimeRange } from "../lib/types.ts";
import { TARGET_PARTICLES } from "../lib/vocab.ts";
import type { ParticleToken } from "../lib/vocab.ts";
import type {
  ClipDetail,
  ReviewField,
} from "../lib/track-c/types.ts";

test("demo graph is visibly scoped and preserves video-qualified identities", () => {
  const graph = buildGraphDataset(createDemoClips(), "demo");

  assert.deepEqual(graph.meta, {
    scope: "demo",
    source: "demo",
    demo_fixture: true,
    confirmed_only: false,
    truncated: false,
    unique_clip_count: 7,
    unique_video_count: 3,
    particle_instance_count: 7,
  });
  for (const { token } of TARGET_PARTICLES) {
    assert.ok(graph.nodes.some(({ id }) => id === `Particle:${token}`));
  }
  assert.ok(graph.nodes.some(({ id }) => id === "Speaker:vid03:spkA"));
  assert.ok(graph.nodes.some(({ id }) => id === "Speaker:vid04:spkB"));
  assert.notEqual(
    graph.nodes.find(({ id }) => id === "Speaker:vid03:spkA")?.id,
    graph.nodes.find(({ id }) => id === "Speaker:vid04:spkA")?.id,
  );
});

test("particle occurrence relationships retain stable IDs, surface form, time, and provenance", () => {
  const graph = buildGraphDataset([createDemoClip()], "demo");
  const relationship = graph.links.find(
    ({ kind }) => kind === "CONTAINS_PARTICLE",
  );

  assert.ok(relationship);
  assert.equal(relationship.instance_id, "vid03:u17");
  assert.equal(relationship.properties.surface_form, "嗎");
  assert.equal(relationship.properties.start_ms, 14_310);
  assert.equal(relationship.properties.end_ms, 14_560);
  assert.equal(relationship.properties.fp_token_suggestion_source, "mfa");
  assert.equal(relationship.properties.fp_timing_review_state, "suggested");
  assert.equal(
    relationship.properties.fp_timing_suggestion_confidence,
    0.82,
  );
});

test("confirmed graph includes only fully reviewed demo fixtures", () => {
  const clips = createDemoClips();
  const confirmedClips = clips.filter(
    ({ clip }) => clip.status === "confirmed",
  );
  const pendingClips = clips.filter(
    ({ clip }) => clip.status !== "confirmed",
  );
  const graph = buildGraphDataset(clips, "confirmed");

  assert.equal(graph.meta.confirmed_only, true);
  assert.equal(confirmedClips.length, 3);
  assert.equal(graph.meta.unique_clip_count, confirmedClips.length);
  assert.equal(graph.meta.unique_video_count, 3);
  assert.equal(graph.meta.particle_instance_count, 3);
  for (const clip of confirmedClips) {
    assert.ok(
      graph.nodes.some(({ id }) => id === `Clip:${clip.clip.id}`),
    );
  }
  for (const clip of pendingClips) {
    assert.equal(
      graph.nodes.some(({ id }) => id === `Clip:${clip.clip.id}`),
      false,
    );
  }
});

test("confirmed graph includes only explicitly reviewed values", () => {
  const confirmed = confirmClip(createDemoClip());
  const graph = buildGraphDataset(
    [confirmed, createSecondDemoClip()],
    "confirmed",
  );

  assert.equal(graph.meta.unique_clip_count, 1);
  assert.equal(graph.meta.particle_instance_count, 1);
  assert.ok(
    graph.nodes.some(
      ({ id }) => id === `Clip:${confirmed.clip.id}`,
    ),
  );
  assert.ok(graph.nodes.some(({ id }) => id === "Particle:吗"));
  assert.ok(
    graph.links
      .filter(({ kind }) => kind === "INTERPRETED_AS")
      .every(
        ({ properties }) =>
          properties.communicative_function_review_state === "confirmed",
      ),
  );
  assert.equal(
    graph.nodes.some(
      ({ id }) => id === `Clip:${createSecondDemoClip().clip.id}`,
    ),
    false,
  );
});

test("skipped optional values stay absent instead of falling back to suggestions", () => {
  let clip = createDemoClip();
  clip = applyClipCommand(clip, {
    expected_version: clip.version,
    command: "review_field",
    target: { scope: "clip", field: "tone_contour" },
    review: { action: "skip", reason: "Not measurable in this example." },
  });
  clip = applyClipCommand(clip, {
    expected_version: clip.version,
    command: "review_field",
    target: { scope: "clip", field: "communicative_function" },
    review: { action: "skip", reason: "No reviewed interpretation." },
  });
  const graph = buildGraphDataset([confirmClip(clip)], "confirmed");

  assert.equal(graph.nodes.some(({ kind }) => kind === "Tone"), false);
  assert.equal(
    graph.nodes.some(({ kind }) => kind === "CommunicativeFunction"),
    false,
  );
  assert.equal(graph.links.some(({ kind }) => kind === "HAS_TONE"), false);
  assert.equal(
    graph.links.some(({ kind }) => kind === "INTERPRETED_AS"),
    false,
  );
});

test("multi-particle edges remain distinct and fp_count is derived from instances", () => {
  const clip = createDemoClip();
  const first = clip.particle_instances[0]!;
  const second = {
    ...structuredClone(first),
    instance_id: "vid03:u17:ne",
    surface_form: "呢",
    fp_pinyin: "ne",
    fields: {
      ...structuredClone(first.fields),
      fp_token: confirmedField<ParticleToken>("呢"),
      fp_timing: confirmedField<TimeRange>({
        start_ms: 15_100,
        end_ms: 15_320,
      }),
    },
  };
  const multi: ClipDetail = {
    ...clip,
    particle_instances: [first, second],
  };
  const graph = buildGraphDataset([multi], "demo");
  const clipNode = graph.nodes.find(({ kind }) => kind === "Clip");
  const particleLinks = graph.links.filter(
    ({ kind }) => kind === "CONTAINS_PARTICLE",
  );

  assert.equal(clipNode?.properties.fp_count, 2);
  assert.equal(particleLinks.length, 2);
  assert.deepEqual(
    particleLinks.map(({ instance_id }) => instance_id).sort(),
    ["vid03:u17", "vid03:u17:ne"],
  );
  assert.equal(new Set(particleLinks.map(({ id }) => id)).size, 2);
});

test("rejected fixtures are not exposed by demo projection", () => {
  const rejected = createDemoClip();
  rejected.clip.status = "rejected";

  const graph = buildGraphDataset([rejected], "demo");
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.links, []);
});

function confirmClip(initial: ClipDetail): ClipDetail {
  let clip = initial;
  while (true) {
    const unresolved = listReviewUnits(clip).find(
      ({ field }) => field.state === "suggested",
    );
    if (unresolved === undefined) {
      break;
    }
    clip = applyClipCommand(clip, {
      expected_version: clip.version,
      command: "review_field",
      target: unresolved.target,
      review: { action: "accept" },
    });
  }
  return applyClipCommand(clip, {
    expected_version: clip.version,
    command: "confirm_clip",
  });
}

function confirmedField<T>(value: T): ReviewField<T> {
  return {
    state: "confirmed",
    value,
    suggestion: {
      value,
      source: "fixture",
      confidence: 1,
    },
    review: {
      action: "accepted",
      reviewer_id: "graph-test",
      reviewed_at: "2026-07-30T22:00:00.000Z",
    },
  };
}
