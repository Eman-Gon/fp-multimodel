import type {
  GestureAnnotationDraft,
  TrackBBatchRequest,
  TrackBDependencies,
  TrackBRequest,
  TrackBVideoDraft,
} from "../types.ts";
import { createGestureAnalysisWindow } from "./analysis-window.ts";
import {
  buildPegasusGesturePrompt,
  parsePegasusGesture,
  PEGASUS_GESTURE_RESPONSE_SCHEMA,
} from "./pegasus.ts";
import { reconcileGestureDraft } from "./reconcile-gesture.ts";
import { validateTrackAParticle } from "./track-a-handoff.ts";
import { assertMilliseconds, assertNonEmptyId } from "./validation.ts";

/**
 * Provider-independent B1–B3 orchestration. Concrete TwelveLabs and MediaPipe
 * adapters implement the two dependency interfaces in lib/types.ts.
 */
export async function draftTrackBAnnotations(
  request: TrackBRequest,
  dependencies: TrackBDependencies,
): Promise<readonly GestureAnnotationDraft[]> {
  assertNonEmptyId(request.video_id, "request.video_id");
  assertMilliseconds(request.video_duration_ms, "request.video_duration_ms");

  const seenInstanceIds = new Set<string>();
  const seenUtteranceIds = new Set<string>();
  const workItems = request.particle_instances.map((particle, index) => {
    if (seenInstanceIds.has(particle.instance_id)) {
      throw new RangeError(`duplicate particle instance_id: ${particle.instance_id}`);
    }
    seenInstanceIds.add(particle.instance_id);
    if (seenUtteranceIds.has(particle.utterance_id)) {
      throw new RangeError(`duplicate particle utterance_id: ${particle.utterance_id}`);
    }
    seenUtteranceIds.add(particle.utterance_id);
    validateTrackAParticle(
      particle,
      request.video_id,
      request.video_duration_ms,
      `request.particle_instances[${index}]`,
    );

    return {
      particle,
      window: createGestureAnalysisWindow(
        particle,
        request.video_duration_ms,
      ),
    };
  });

  const drafts: GestureAnnotationDraft[] = [];
  for (const { particle, window } of workItems) {
    const rawSemanticGesture =
      await dependencies.semanticAnalyzer.analyzeGesture({
        video_id: request.video_id,
        instance_id: particle.instance_id,
        particle,
        window,
        prompt: buildPegasusGesturePrompt(window, particle),
        response_schema: PEGASUS_GESTURE_RESPONSE_SCHEMA,
      });
    const semanticGesture = parsePegasusGesture(rawSemanticGesture, window);

    const motionIntervals = await dependencies.motionAnalyzer.detectMotion({
      video_id: request.video_id,
      instance_id: particle.instance_id,
      window,
      semantic_gesture: semanticGesture,
    });

    drafts.push(
      reconcileGestureDraft(
        request.video_id,
        particle.instance_id,
        window,
        semanticGesture,
        motionIntervals,
      ),
    );
  }

  return drafts;
}

/**
 * Analyze every video in a project without combining source timelines or
 * participant namespaces. Independent videos can run concurrently.
 */
export async function draftTrackBBatchAnnotations(
  request: TrackBBatchRequest,
  dependencies: TrackBDependencies,
): Promise<readonly TrackBVideoDraft[]> {
  assertNonEmptyId(request.project_id, "request.project_id");
  if (request.videos.length === 0) {
    throw new RangeError("request.videos must contain at least one video");
  }

  const seenVideoIds = new Set<string>();
  for (const video of request.videos) {
    assertNonEmptyId(video.video_id, "request.videos[].video_id");
    if (seenVideoIds.has(video.video_id)) {
      throw new RangeError(`duplicate video_id: ${video.video_id}`);
    }
    seenVideoIds.add(video.video_id);
  }

  return Promise.all(
    request.videos.map(async (video): Promise<TrackBVideoDraft> => {
      try {
        return {
          video_id: video.video_id,
          status: "completed",
          annotations: await draftTrackBAnnotations(video, dependencies),
        };
      } catch (error) {
        return {
          video_id: video.video_id,
          status: "failed",
          annotations: [],
          error_message:
            error instanceof Error ? error.message : "Unknown Track B failure",
        };
      }
    }),
  );
}
