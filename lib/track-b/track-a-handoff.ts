import type {
  FinalParticleInstance,
  TrackAParticle,
  TrackAParticleDetectionResult,
  TrackAExtendedParticleCandidate,
  TrackBHandoff,
} from "../types.ts";
import {
  EXTENDED_PARTICLE_CANDIDATES,
  TARGET_PARTICLES,
} from "../vocab.ts";
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

function validateSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
}

function validateCandidate(
  candidate: TrackAExtendedParticleCandidate,
  videoId: string,
  videoDurationMs: number,
  label: string,
): void {
  assertNonEmptyId(candidate.utterance_id, `${label}.utterance_id`);
  assertNonEmptyId(candidate.instance_id, `${label}.instance_id`);
  assertNonEmptyId(candidate.surface_form, `${label}.surface_form`);
  const expectedInstanceId = `${videoId}:${candidate.utterance_id}`;
  if (candidate.instance_id !== expectedInstanceId) {
    throw new RangeError(
      `${label}.instance_id must equal ${expectedInstanceId}`,
    );
  }
  if (
    !(EXTENDED_PARTICLE_CANDIDATES as readonly string[]).includes(
      candidate.normalized_candidate,
    )
  ) {
    throw new TypeError(
      `${label}.normalized_candidate is not in the review inventory`,
    );
  }
  if (
    candidate.surface_form.replaceAll("嗎", "吗") !==
    candidate.normalized_candidate
  ) {
    throw new TypeError(
      `${label}.surface_form does not match normalized_candidate`,
    );
  }
  if (
    candidate.source !== "mfa_rule" ||
    candidate.confirmed !== false ||
    candidate.review_required !== true
  ) {
    throw new TypeError(
      `${label} must remain an unconfirmed review-required MFA candidate`,
    );
  }
  if (
    candidate.confidence !== null &&
    (!Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1)
  ) {
    throw new RangeError(
      `${label}.confidence must be null or between 0 and 1`,
    );
  }
  assertTimeRange(
    { start_ms: candidate.start_ms, end_ms: candidate.end_ms },
    label,
  );
  if (candidate.end_ms > videoDurationMs) {
    throw new RangeError(`${label}.end_ms must not exceed videoDurationMs`);
  }
}

/**
 * Adapts the current Python Track A JSON artifact to B1–B3. Track A detects at
 * most one final particle per unique utterance and already emits the stable
 * instance_id that later graph relationships must preserve.
 */
export function createTrackBHandoff(
  detection: TrackAParticleDetectionResult,
): TrackBHandoff {
  if (detection.schema_version !== 1) {
    throw new TypeError("detection.schema_version must equal 1");
  }
  assertNonEmptyId(detection.video_id, "detection.video_id");
  const videoDurationMs = detection.provenance.duration_ms;
  assertMilliseconds(videoDurationMs, "videoDurationMs");
  if (videoDurationMs <= 0) {
    throw new RangeError("detection provenance duration_ms must be positive");
  }
  if (detection.provenance.fps !== 30) {
    throw new RangeError("detection provenance fps must equal 30");
  }
  validateSha256(
    detection.provenance.transcript_sha256,
    "provenance.transcript_sha256",
  );
  validateSha256(
    detection.provenance.source_audio_sha256,
    "provenance.source_audio_sha256",
  );
  validateSha256(
    detection.provenance.normalized_video_sha256,
    "provenance.normalized_video_sha256",
  );
  assertNonEmptyId(
    detection.provenance.dictionary_model,
    "provenance.dictionary_model",
  );
  assertNonEmptyId(
    detection.provenance.acoustic_model,
    "provenance.acoustic_model",
  );

  const particleInstances: FinalParticleInstance[] = [];
  const particlesByInstanceId: Record<string, TrackAParticle> = Object.create(null);
  const seenUtteranceIds = new Set<string>();
  const seenInstanceIds = new Set<string>();

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
    if (seenInstanceIds.has(instanceId)) {
      throw new RangeError(`duplicate Track B instance_id: ${instanceId}`);
    }
    seenInstanceIds.add(instanceId);

    particleInstances.push(particle);
    particlesByInstanceId[instanceId] = particle;
  }

  for (const [index, candidate] of detection.candidates.entries()) {
    if (seenUtteranceIds.has(candidate.utterance_id)) {
      throw new RangeError(
        `duplicate Track A utterance_id: ${candidate.utterance_id}`,
      );
    }
    validateCandidate(
      candidate,
      detection.video_id,
      videoDurationMs,
      `candidates[${index}]`,
    );
    if (seenInstanceIds.has(candidate.instance_id)) {
      throw new RangeError(
        `duplicate Track A instance_id: ${candidate.instance_id}`,
      );
    }
    seenUtteranceIds.add(candidate.utterance_id);
    seenInstanceIds.add(candidate.instance_id);
  }

  return {
    request: {
      video_id: detection.video_id,
      video_duration_ms: videoDurationMs,
      particle_instances: particleInstances,
    },
    particles_by_instance_id: particlesByInstanceId,
    candidates_for_review: detection.candidates,
  };
}
