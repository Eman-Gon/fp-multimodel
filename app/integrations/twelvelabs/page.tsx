import {
  TwelveLabsIntegration,
  type TwelveLabsVideoOption,
} from "@/components/integrations/twelvelabs-integration.tsx";
import { createGestureAnalysisWindow } from "@/lib/track-b/analysis-window.ts";
import { getClipById, listClips } from "@/lib/track-c/repository.ts";

export const dynamic = "force-dynamic";

export default function TwelveLabsIntegrationPage() {
  return <TwelveLabsIntegration videoOptions={getVideoOptions()} />;
}

function getVideoOptions(): readonly TwelveLabsVideoOption[] {
  const options = new Map<string, TwelveLabsVideoOption>();

  for (const clipSummary of listClips()) {
    if (options.has(clipSummary.video_id)) {
      continue;
    }

    const clip = getClipById(clipSummary.id);
    const particle = clip?.particle_instances[0];
    if (clip === null || clip === undefined || particle === undefined) {
      continue;
    }

    const particleInterval =
      particle.fields.fp_timing.state === "skipped"
        ? particle.fields.fp_timing.suggestion.value
        : (particle.fields.fp_timing.value ??
          particle.fields.fp_timing.suggestion.value);
    const analysisWindow = createGestureAnalysisWindow(
      {
        instance_id: particle.instance_id,
        fp_start_ms: particleInterval.start_ms,
        fp_end_ms: particleInterval.end_ms,
      },
      clip.video.duration_ms,
    );

    options.set(clip.video.id, {
      video_id: clip.video.id,
      instance_id: particle.instance_id,
      analysis_window: analysisWindow,
      particle_interval: particleInterval,
    });
  }

  return Array.from(options.values()).sort((left, right) =>
    left.video_id.localeCompare(right.video_id),
  );
}
