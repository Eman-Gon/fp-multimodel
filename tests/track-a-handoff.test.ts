import assert from "node:assert/strict";
import test from "node:test";

import { createTrackBHandoff } from "../lib/track-b/track-a-handoff.ts";

test("adapts the current Track A particle artifact without losing metadata", () => {
  const trackAParticle = {
    instance_id: "vid1:u1",
    fp_token: "吗",
    fp_pinyin: "ma",
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
    instance_id: "vid1:u1",
    fp_token: "吗",
    fp_pinyin: "ma",
    surface_form: "吗",
    fp_start_ms: 1_000,
    fp_end_ms: 1_100,
    utterance_id: "u1",
  };

  assert.throws(
    () =>
      createTrackBHandoff(
        { video_id: "vid1", particles: [duplicate, duplicate] },
        2_000,
      ),
    /duplicate Track B instance_id/,
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
