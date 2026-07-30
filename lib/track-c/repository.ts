import "server-only";

import { applyClipCommand } from "./review.ts";
import { createDemoClip, DEMO_CLIP_ID } from "./seed.ts";
import type { ClipCommand, ClipDetail } from "./types.ts";

const STORE_KEY = "__finalParticleTrackCStore";

type StoreGlobal = typeof globalThis & {
  [STORE_KEY]?: Map<string, ClipDetail>;
};

function getStore(): Map<string, ClipDetail> {
  const storeGlobal = globalThis as StoreGlobal;
  if (storeGlobal[STORE_KEY] === undefined) {
    storeGlobal[STORE_KEY] = new Map([[DEMO_CLIP_ID, createDemoClip()]]);
  }
  return storeGlobal[STORE_KEY];
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

