import type {
  FinalParticleInstance,
  TrackAParticle,
  TrackAParticleDetectionResult,
  TrackBHandoff,
} from "../types.ts";
import { TARGET_PARTICLES } from "../vocab.ts";
import {
  assertMilliseconds,
  assertNonEmptyId,
  assertTimeRange,
} from "./validation.ts";

/**
 * Adapts the current Python Track A JSON artifact to B1–B3. Track A detects at
 * most one final particle per unique utterance and already emits the stable
 * instance_id that later graph relationships must preserve.
 */
export function createTrackBHandoff(
  detection: TrackAParticleDetectionResult,
  videoDurationMs: number,
): TrackBHandoff {
  assertNonEmptyId(detection.video_id, "detection.video_id");
  assertMilliseconds(videoDurationMs, "videoDurationMs");

  const particleInstances: FinalParticleInstance[] = [];
  const particlesByInstanceId: Record<string, TrackAParticle> = Object.create(null);
  const seenUtteranceIds = new Set<string>();

  for (const [index, particle] of detection.particles.entries()) {
    assertNonEmptyId(particle.utterance_id, `particles[${index}].utterance_id`);
    assertNonEmptyId(particle.instance_id, `particles[${index}].instance_id`);
    assertNonEmptyId(particle.surface_form, `particles[${index}].surface_form`);

    if (seenUtteranceIds.has(particle.utterance_id)) {
      throw new RangeError(
        `duplicate Track A utterance_id: ${particle.utterance_id}`,
      );
    }
    seenUtteranceIds.add(particle.utterance_id);

    const expectedInstanceId = `${detection.video_id}:${particle.utterance_id}`;
    if (particle.instance_id !== expectedInstanceId) {
      throw new RangeError(
        `particles[${index}].instance_id must equal ${expectedInstanceId}`,
      );
    }

    const vocabularyEntry = TARGET_PARTICLES.find(
      (entry) => entry.token === particle.fp_token,
    );
    if (vocabularyEntry === undefined) {
      throw new TypeError(
        `particles[${index}].fp_token is not in the controlled vocabulary`,
      );
    }
    if (particle.fp_pinyin !== vocabularyEntry.pinyin) {
      throw new TypeError(
        `particles[${index}].fp_pinyin does not match fp_token`,
      );
    }
    if (
      !(vocabularyEntry.surface_forms as readonly string[]).includes(
        particle.surface_form,
      )
    ) {
      throw new TypeError(
        `particles[${index}].surface_form does not match fp_token`,
      );
    }

    assertTimeRange(
      {
        start_ms: particle.fp_start_ms,
        end_ms: particle.fp_end_ms,
      },
      `particles[${index}]`,
    );
    if (particle.fp_end_ms > videoDurationMs) {
      throw new RangeError(
        `particles[${index}].fp_end_ms must not exceed videoDurationMs`,
      );
    }

    const instanceId = particle.instance_id;
    if (particlesByInstanceId[instanceId] !== undefined) {
      throw new RangeError(`duplicate Track B instance_id: ${instanceId}`);
    }

    particleInstances.push(particle);
    particlesByInstanceId[instanceId] = particle;
  }

  return {
    request: {
      video_id: detection.video_id,
      video_duration_ms: videoDurationMs,
      particle_instances: particleInstances,
    },
    particles_by_instance_id: particlesByInstanceId,
  };
}
