import {
  TwelveLabsIntegration,
  type TwelveLabsVideoOption,
} from "@/components/integrations/twelvelabs-integration.tsx";
import { createGestureAnalysisWindow } from "@/lib/track-b/analysis-window.ts";
import { getClipById, listClips } from "@/lib/track-c/repository.ts";
import type { FinalParticleInstance } from "@/lib/types.ts";
import { TARGET_PARTICLES } from "@/lib/vocab.ts";

export const dynamic = "force-dynamic";

export default function TwelveLabsIntegrationPage() {
  return <TwelveLabsIntegration videoOptions={getVideoOptions()} />;
}

function getVideoOptions(): readonly TwelveLabsVideoOption[] {
  const options = new Map<string, TwelveLabsVideoOption>();

  for (const clipSummary of listClips()) {
    const clip = getClipById(clipSummary.id);
    if (clip === null || clip === undefined) {
      continue;
    }

    for (const particle of clip.particle_instances) {
      if (
        particle.fields.fp_token.state === "skipped" ||
        particle.fields.fp_timing.state === "skipped"
      ) {
        continue;
      }
      const key = `${clip.video.id}:${particle.instance_id}`;
      if (options.has(key)) {
        continue;
      }
      // This endpoint accepts the immutable Track A handoff shape. Replaying
      // the retained suggestions avoids falsely attributing a later human edit
      // to the original MFA rule.
      const particleInterval = particle.fields.fp_timing.suggestion.value;
      const particleToken = particle.fields.fp_token.suggestion.value;
      const vocabularyEntry = TARGET_PARTICLES.find(
        ({ token }) => token === particleToken,
      );
      if (vocabularyEntry === undefined) {
        continue;
      }
      const trackAParticle = {
        instance_id: particle.instance_id,
        fp_token: particleToken,
        fp_pinyin: vocabularyEntry.pinyin,
        surface_form: particle.surface_form,
        fp_start_ms: particleInterval.start_ms,
        fp_end_ms: particleInterval.end_ms,
        utterance_id: clip.utterance.id,
        source: "mfa_rule",
        confidence: particle.fields.fp_timing.suggestion.confidence,
        confirmed: false,
      } satisfies FinalParticleInstance;
      const analysisWindow = createGestureAnalysisWindow(
        trackAParticle,
        clip.video.duration_ms,
      );

      options.set(key, {
        video_id: clip.video.id,
        instance_id: particle.instance_id,
        video_duration_ms: clip.video.duration_ms,
        source_url: clip.video.source_url,
        analysis_window: analysisWindow,
        particle_interval: particleInterval,
        particle: trackAParticle,
      });
    }
  }

  return Array.from(options.values()).sort(
    (left, right) =>
      left.video_id.localeCompare(right.video_id) ||
      left.instance_id.localeCompare(right.instance_id),
  );
}
