import assert from "node:assert/strict";
import test from "node:test";

import { createTrackBHandoff } from "../lib/track-b/track-a-handoff.ts";

const draftProvenance = {
  source: "mfa_rule" as const,
  confidence: null,
  confirmed: false as const,
};

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

  const handoff = createTrackBHandoff(
    {
      video_id: "vid1",
      particles: [trackAParticle],
    },
    20_000,
  );

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
});

test("rejects zero-duration Track A intervals at the B handoff", () => {
  assert.throws(
    () =>
      createTrackBHandoff(
        {
          video_id: "vid1",
          particles: [
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
        },
        2_000,
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
        {
          video_id: "vid1",
          particles: [
            duplicate,
            {
              ...duplicate,
              instance_id: "vid1:u1:duplicate",
            },
          ],
        },
        2_000,
      ),
    /duplicate Track A utterance_id/,
  );

  assert.throws(
    () =>
      createTrackBHandoff(
        {
          video_id: "vid1",
          particles: [
            {
              ...duplicate,
              instance_id: "vid1:u2",
              utterance_id: "u2",
              fp_start_ms: 1_900,
              fp_end_ms: 2_100,
            },
          ],
        },
        2_000,
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
        {
          video_id: "vid1",
          particles: [{ ...valid, fp_pinyin: "ne" }],
        },
        2_000,
      ),
    /fp_pinyin does not match/,
  );

  assert.throws(
    () =>
      createTrackBHandoff(
        {
          video_id: "vid1",
          particles: [{ ...valid, surface_form: "呢" }],
        },
        2_000,
      ),
    /surface_form does not match/,
  );
});

test("rejects a stale or cross-video Track A instance ID", () => {
  assert.throws(
    () =>
      createTrackBHandoff(
        {
          video_id: "vid1",
          particles: [
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
        },
        2_000,
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
        {
          video_id: "vid1",
          particles: [invalid],
        } as never,
        2_000,
      ),
    /must remain unconfirmed/,
  );
});
