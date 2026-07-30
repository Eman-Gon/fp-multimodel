import type {
  FinalParticleInstance,
  TrackAParticle,
  TrackAParticleDetectionResult,
  TrackBHandoff,
} from "../types.ts";
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

  for (const [index, particle] of detection.particles.entries()) {
    assertNonEmptyId(particle.utterance_id, `particles[${index}].utterance_id`);
    assertNonEmptyId(particle.instance_id, `particles[${index}].instance_id`);
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
