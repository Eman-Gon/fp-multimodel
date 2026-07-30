import assert from "node:assert/strict";
import test from "node:test";

import type {
  TrackAParticle,
  TrackAParticleDetectionResult,
  TrackAExtendedParticleCandidate,
} from "../lib/types.ts";
import { createTrackBHandoff } from "../lib/track-b/track-a-handoff.ts";

const draftProvenance = {
  source: "mfa_rule" as const,
  confidence: null,
  confirmed: false as const,
};

function artifact(
  particles: readonly TrackAParticle[],
  options: {
    durationMs?: number;
    candidates?: readonly TrackAExtendedParticleCandidate[];
  } = {},
): TrackAParticleDetectionResult {
  return {
    schema_version: 1,
    video_id: "vid1",
    provenance: {
      duration_ms: options.durationMs ?? 2_000,
      fps: 30,
      transcript_sha256: "a".repeat(64),
      source_audio_sha256: "b".repeat(64),
      normalized_video_sha256: "c".repeat(64),
      dictionary_model: "mandarin_china_mfa",
      acoustic_model: "mandarin_mfa",
    },
    particles,
    candidates: options.candidates ?? [],
  };
}

test("adapts the current Track A particle artifact without losing metadata", () => {
  const trackAParticle = {
    ...draftProvenance,
    instance_id: "vid1:u1",
    fp_token: "吗" as const,
    fp_pinyin: "ma" as const,
    surface_form: "嗎",
    fp_start_ms: 13_900,
    fp_end_ms: 14_480,
    utterance_id: "u1",
  };

  const detection = artifact([trackAParticle], { durationMs: 20_000 });
  const handoff = createTrackBHandoff(detection);

  assert.equal(handoff.schema_version, detection.schema_version);
  assert.equal(handoff.provenance, detection.provenance);
  assert.deepEqual(handoff.request, {
    video_id: "vid1",
    video_duration_ms: 20_000,
    particle_instances: [
      {
        instance_id: "vid1:u1",
        fp_token: "吗",
        fp_pinyin: "ma",
        surface_form: "嗎",
        fp_start_ms: 13_900,
        fp_end_ms: 14_480,
        utterance_id: "u1",
        source: "mfa_rule",
        confidence: null,
        confirmed: false,
      },
    ],
  });
  assert.equal(
    handoff.particles_by_instance_id["vid1:u1"],
    trackAParticle,
  );
  assert.deepEqual(handoff.candidates_for_review, []);
});

test("rejects zero-duration Track A intervals at the B handoff", () => {
  assert.throws(
    () =>
      createTrackBHandoff(
        artifact(
          [
            {
              ...draftProvenance,
              instance_id: "vid1:u1",
              fp_token: "吗",
              fp_pinyin: "ma",
              surface_form: "吗",
              fp_start_ms: 1_000,
              fp_end_ms: 1_000,
              utterance_id: "u1",
            },
          ],
        ),
      ),
    /end_ms must be greater/,
  );
});

test("rejects duplicate utterance IDs and particles beyond the source duration", () => {
  const duplicate = {
    ...draftProvenance,
    instance_id: "vid1:u1",
    fp_token: "吗" as const,
    fp_pinyin: "ma" as const,
    surface_form: "吗",
    fp_start_ms: 1_000,
    fp_end_ms: 1_100,
    utterance_id: "u1",
  };

  assert.throws(
    () =>
      createTrackBHandoff(
        artifact(
          [
            duplicate,
            {
              ...duplicate,
              instance_id: "vid1:u1:duplicate",
            },
          ],
        ),
      ),
    /duplicate Track A utterance_id/,
  );

  assert.throws(
    () =>
      createTrackBHandoff(
        artifact(
          [
            {
              ...duplicate,
              instance_id: "vid1:u2",
              utterance_id: "u2",
              fp_start_ms: 1_900,
              fp_end_ms: 2_100,
            },
          ],
        ),
      ),
    /must not exceed/,
  );
});

test("validates Track A particle vocabulary before building model prompts", () => {
  const valid = {
    ...draftProvenance,
    instance_id: "vid1:u1",
    fp_token: "吗" as const,
    fp_pinyin: "ma" as const,
    surface_form: "嗎",
    fp_start_ms: 1_000,
    fp_end_ms: 1_100,
    utterance_id: "u1",
  };

  assert.throws(
    () =>
      createTrackBHandoff(
        artifact([
          { ...valid, fp_pinyin: "ne" },
        ] as never),
      ),
    /fp_pinyin does not match/,
  );

  assert.throws(
    () =>
      createTrackBHandoff(
        artifact([
          { ...valid, surface_form: "呢" },
        ]),
      ),
    /surface_form does not match/,
  );
});

test("rejects a stale or cross-video Track A instance ID", () => {
  assert.throws(
    () =>
      createTrackBHandoff(
        artifact(
          [
            {
              ...draftProvenance,
              instance_id: "vid2:u9",
              fp_token: "吗",
              fp_pinyin: "ma",
              surface_form: "吗",
              fp_start_ms: 1_000,
              fp_end_ms: 1_100,
              utterance_id: "u1",
            },
          ],
        ),
      ),
    /instance_id must equal vid1:u1/,
  );
});

test("refuses to promote Track A draft provenance at the handoff", () => {
  const invalid = {
    ...draftProvenance,
    instance_id: "vid1:u1",
    fp_token: "吗" as const,
    fp_pinyin: "ma" as const,
    surface_form: "吗",
    fp_start_ms: 1_000,
    fp_end_ms: 1_100,
    utterance_id: "u1",
    confirmed: true,
  };

  assert.throws(
    () =>
      createTrackBHandoff(
        artifact([invalid] as never),
      ),
    /must remain unconfirmed/,
  );
});

test("keeps extended candidates out of Track B and available for review", () => {
  const candidate = {
    instance_id: "vid1:u2",
    normalized_candidate: "了吗吧",
    surface_form: "了嗎吧",
    start_ms: 1_100,
    end_ms: 1_500,
    utterance_id: "u2",
    source: "mfa_rule" as const,
    confidence: null,
    confirmed: false as const,
    review_required: true as const,
  };

  const handoff = createTrackBHandoff(
    artifact([], { candidates: [candidate] }),
  );

  assert.deepEqual(handoff.request.particle_instances, []);
  assert.deepEqual(handoff.candidates_for_review, [candidate]);
});

test("derives video duration from versioned Track A provenance", () => {
  const invalid = artifact([], { durationMs: 0 });

  assert.throws(
    () => createTrackBHandoff(invalid),
    /duration_ms must be positive/,
  );
});

test("rejects a missing or null Track A provenance object", () => {
  const valid = artifact([]);

  assert.throws(
    () => createTrackBHandoff({ ...valid, provenance: null }),
    /detection\.provenance must be an object/,
  );
  assert.throws(
    () => {
      const { provenance: _provenance, ...withoutProvenance } = valid;
      createTrackBHandoff(withoutProvenance);
    },
    /detection\.provenance must be an object/,
  );
});

test("rejects non-array Track A particle and candidate collections", () => {
  const valid = artifact([]);

  assert.throws(
    () => createTrackBHandoff({ ...valid, particles: {} }),
    /detection\.particles must be an array/,
  );
  assert.throws(
    () => createTrackBHandoff({ ...valid, candidates: null }),
    /detection\.candidates must be an array/,
  );
});

test("rejects non-object entries at the Track A JSON boundary", () => {
  const valid = artifact([]);

  assert.throws(
    () => createTrackBHandoff({ ...valid, particles: [null] }),
    /particles\[0\] must be an object/,
  );
  assert.throws(
    () => createTrackBHandoff({ ...valid, candidates: [null] }),
    /candidates\[0\] must be an object/,
  );
});
