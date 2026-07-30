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

export function validateTrackAParticle(
  particle: TrackAParticle,
  videoId: string,
  videoDurationMs: number,
  label = "particle",
): void {
  assertNonEmptyId(videoId, "videoId");
  assertMilliseconds(videoDurationMs, "videoDurationMs");
  assertNonEmptyId(particle.utterance_id, `${label}.utterance_id`);
  assertNonEmptyId(particle.instance_id, `${label}.instance_id`);
  assertNonEmptyId(particle.surface_form, `${label}.surface_form`);

  const expectedInstanceId = `${videoId}:${particle.utterance_id}`;
  if (particle.instance_id !== expectedInstanceId) {
    throw new RangeError(
      `${label}.instance_id must equal ${expectedInstanceId}`,
    );
  }

  const vocabularyEntry = TARGET_PARTICLES.find(
    (entry) => entry.token === particle.fp_token,
  );
  if (vocabularyEntry === undefined) {
    throw new TypeError(
      `${label}.fp_token is not in the controlled vocabulary`,
    );
  }
  if (particle.fp_pinyin !== vocabularyEntry.pinyin) {
    throw new TypeError(`${label}.fp_pinyin does not match fp_token`);
  }
  if (
    !(vocabularyEntry.surface_forms as readonly string[]).includes(
      particle.surface_form,
    )
  ) {
    throw new TypeError(`${label}.surface_form does not match fp_token`);
  }
  if (particle.source !== "mfa_rule") {
    throw new TypeError(`${label}.source must equal mfa_rule`);
  }
  if (particle.confirmed !== false) {
    throw new TypeError(
      `${label} must remain unconfirmed until human review`,
    );
  }
  if (
    particle.confidence !== null &&
    (!Number.isFinite(particle.confidence) ||
      particle.confidence < 0 ||
      particle.confidence > 1)
  ) {
    throw new RangeError(
      `${label}.confidence must be null or between 0 and 1`,
    );
  }

  assertTimeRange(
    {
      start_ms: particle.fp_start_ms,
      end_ms: particle.fp_end_ms,
    },
    label,
  );
  if (particle.fp_end_ms > videoDurationMs) {
    throw new RangeError(
      `${label}.fp_end_ms must not exceed videoDurationMs`,
    );
  }
}

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

    if (seenUtteranceIds.has(particle.utterance_id)) {
      throw new RangeError(
        `duplicate Track A utterance_id: ${particle.utterance_id}`,
      );
    }
    seenUtteranceIds.add(particle.utterance_id);

    validateTrackAParticle(
      particle,
      detection.video_id,
      videoDurationMs,
      `particles[${index}]`,
    );

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
