import type {
  GestureAnnotationDraft,
  TrackBDependencies,
  TrackBRequest,
} from "../types.ts";
import { createGestureAnalysisWindow } from "./analysis-window.ts";
import {
  buildPegasusGesturePrompt,
  parsePegasusGesture,
  PEGASUS_GESTURE_RESPONSE_SCHEMA,
} from "./pegasus.ts";
import { reconcileGestureDraft } from "./reconcile-gesture.ts";
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
  const workItems = request.particle_instances.map((particle) => {
    if (seenInstanceIds.has(particle.instance_id)) {
      throw new RangeError(`duplicate particle instance_id: ${particle.instance_id}`);
    }
    seenInstanceIds.add(particle.instance_id);

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

    const motionIntervals =
      semanticGesture.gesture_type === "none"
        ? []
        : await dependencies.motionAnalyzer.detectMotion({
            video_id: request.video_id,
            instance_id: particle.instance_id,
            window,
            semantic_gesture: semanticGesture,
          });

    drafts.push(
      reconcileGestureDraft(
        particle.instance_id,
        window,
        semanticGesture,
        motionIntervals,
      ),
    );
  }

  return drafts;
}
