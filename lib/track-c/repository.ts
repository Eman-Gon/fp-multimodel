import "server-only";

import { applyClipCommand, listReviewUnits } from "./review.ts";
import {
  createDemoClip,
  createDemoClips,
  DEMO_CLIP_ID,
} from "./seed.ts";
import type { ClipCommand, ClipDetail, ClipListItem } from "./types.ts";

const STORE_KEY = "__finalParticleTrackCStore";

type StoreGlobal = typeof globalThis & {
  [STORE_KEY]?: Map<string, ClipDetail>;
};

function getStore(): Map<string, ClipDetail> {
  const storeGlobal = globalThis as StoreGlobal;
  if (storeGlobal[STORE_KEY] === undefined) {
    storeGlobal[STORE_KEY] = new Map(
      createDemoClips().map((clip) => [clip.clip.id, clip]),
    );
  }
  const store = storeGlobal[STORE_KEY];
  for (const clip of createDemoClips()) {
    if (!store.has(clip.clip.id)) {
      store.set(clip.clip.id, clip);
    }
  }
  return store;
}

export function listClips(): readonly ClipListItem[] {
  return Array.from(getStore().values(), toListItem).sort((left, right) => {
    const leftConfidence = left.lowest_confidence ?? 1;
    const rightConfidence = right.lowest_confidence ?? 1;
    return leftConfidence - rightConfidence;
  });
}

export function getClipById(clipId: string): ClipDetail | null {
  const clip = getStore().get(clipId);
  return clip === undefined ? null : structuredClone(clip);
}

export function updateClip(
  clipId: string,
  command: ClipCommand,
): ClipDetail | null {
  const current = getStore().get(clipId);
  if (current === undefined) {
    return null;
  }
  const next = applyClipCommand(current, command);
  getStore().set(clipId, next);
  return structuredClone(next);
}

export function resetDemoClip(): ClipDetail {
  const clip = createDemoClip();
  getStore().set(DEMO_CLIP_ID, clip);
  return structuredClone(clip);
}

export function resetDemoClips(): readonly ClipDetail[] {
  const clips = createDemoClips();
  const store = getStore();
  store.clear();
  for (const clip of clips) {
    store.set(clip.clip.id, clip);
  }
  return structuredClone(clips);
}

function toListItem(clip: ClipDetail): ClipListItem {
  const particle = clip.particle_instances[0];
  if (particle === undefined) {
    throw new Error(`clip ${clip.clip.id} has no particle instances`);
  }
  const speakerId =
    clip.fields.speaker_id.value ?? clip.fields.speaker_id.suggestion.value;
  const speakerLabel =
    clip.participant_options.find(({ id }) => id === speakerId)?.label ??
    speakerId;
  const confidences = listReviewUnits(clip)
    .map(({ field }) => field.suggestion.confidence)
    .filter((confidence): confidence is number => confidence !== null);

  return {
    id: clip.clip.id,
    name: clip.clip.name,
    video_id: clip.video.id,
    transcript: clip.utterance.text,
    particle: particle.fields.fp_token.value ?? particle.fields.fp_token.suggestion.value,
    particle_pinyin: particle.fp_pinyin,
    communicative_function:
      clip.fields.communicative_function.value ??
      clip.fields.communicative_function.suggestion.value,
    sentence_type:
      clip.fields.sentence_type.value ??
      clip.fields.sentence_type.suggestion.value,
    speaker_id: speakerId,
    speaker_label: speakerLabel,
    status: clip.clip.status,
    lowest_confidence:
      confidences.length === 0 ? null : Math.min(...confidences),
    duration_ms: clip.clip.end_ms - clip.clip.start_ms,
  };
}
