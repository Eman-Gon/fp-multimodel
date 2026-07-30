import type {
  SemanticGestureAnalysisResult,
  SemanticGestureAnalyzer,
  SemanticGestureRequest,
  TimeRange,
} from "../types.ts";
import { assertMilliseconds, assertNonEmptyId } from "../track-b/validation.ts";
import { TWELVELABS_MODEL } from "./config.ts";
import { TwelveLabsClient } from "./client.ts";
import { TwelveLabsError } from "./errors.ts";

export interface TwelveLabsVideoBinding {
  readonly asset_id: string;
  readonly video_duration_ms: number;
}

export type TwelveLabsVideoResolver = (
  videoId: string,
) => TwelveLabsVideoBinding | Promise<TwelveLabsVideoBinding>;

export interface TwelveLabsSemanticGestureAnalyzerOptions {
  readonly client: TwelveLabsClient;
  readonly resolveVideo: TwelveLabsVideoResolver;
}

const MINIMUM_PEGASUS_CLIP_MS = 4_000;

/**
 * Concrete Track B semantic provider backed by TwelveLabs Pegasus 1.5.
 * The strict gesture value and provider-native response are returned in
 * separate fields so the gesture JSON can remain schema compliant.
 */
export class TwelveLabsSemanticGestureAnalyzer
  implements SemanticGestureAnalyzer
{
  readonly #client: TwelveLabsClient;
  readonly #resolveVideo: TwelveLabsVideoResolver;

  constructor(options: TwelveLabsSemanticGestureAnalyzerOptions) {
    this.#client = options.client;
    this.#resolveVideo = options.resolveVideo;
  }

  async analyzeGesture(
    request: SemanticGestureRequest,
  ): Promise<SemanticGestureAnalysisResult> {
    assertNonEmptyId(request.video_id, "request.video_id");
    assertNonEmptyId(request.instance_id, "request.instance_id");
    const binding = await this.#resolveVideo(request.video_id);
    assertNonEmptyId(binding.asset_id, "TwelveLabs asset_id");
    assertMilliseconds(
      binding.video_duration_ms,
      "TwelveLabs video_duration_ms",
    );
    if (binding.video_duration_ms <= 0) {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_REQUEST",
        "The source video duration must be positive.",
        400,
      );
    }

    const providerWindow = createTwelveLabsProviderWindow(
      request.window,
      binding.video_duration_ms,
    );
    const response = await this.#client.analyzeStructured({
      asset_id: binding.asset_id,
      prompt: request.prompt,
      response_schema: request.response_schema,
      start_ms: providerWindow.start_ms,
      end_ms: providerWindow.end_ms,
    });

    if (
      response.finish_reason !== null &&
      response.finish_reason !== "stop"
    ) {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_RESPONSE",
        "TwelveLabs returned an incomplete structured gesture response.",
        502,
      );
    }

    return {
      kind: "semantic_gesture_analysis",
      output: response.data,
      provider_evidence: {
        provider: "twelvelabs",
        model: TWELVELABS_MODEL,
        asset_id: binding.asset_id,
        provider_window: providerWindow,
        response_id: response.id,
        finish_reason: response.finish_reason,
        raw_response: response.raw_response,
      },
    };
  }
}

/**
 * Pegasus clipping requires at least four seconds. Near a video boundary,
 * enlarge only the provider clip while leaving the Track B analysis window
 * and prompt unchanged. Parsed gesture timestamps must still fall inside the
 * original Track B window.
 */
export function createTwelveLabsProviderWindow(
  analysisWindow: TimeRange,
  videoDurationMs: number,
): TimeRange {
  assertMilliseconds(analysisWindow.start_ms, "analysisWindow.start_ms");
  assertMilliseconds(analysisWindow.end_ms, "analysisWindow.end_ms");
  assertMilliseconds(videoDurationMs, "videoDurationMs");
  if (
    analysisWindow.end_ms <= analysisWindow.start_ms ||
    analysisWindow.end_ms > videoDurationMs
  ) {
    throw new TwelveLabsError(
      "TWELVELABS_INVALID_REQUEST",
      "The analysis window must fall within the source video.",
      400,
    );
  }
  if (videoDurationMs < MINIMUM_PEGASUS_CLIP_MS) {
    throw new TwelveLabsError(
      "TWELVELABS_INVALID_REQUEST",
      "TwelveLabs Pegasus requires source video duration of at least 4000ms.",
      400,
    );
  }

  const duration = analysisWindow.end_ms - analysisWindow.start_ms;
  if (duration >= MINIMUM_PEGASUS_CLIP_MS) {
    return { ...analysisWindow };
  }

  const missing = MINIMUM_PEGASUS_CLIP_MS - duration;
  const desiredStart = analysisWindow.start_ms - Math.floor(missing / 2);
  let startMs = Math.max(0, desiredStart);
  let endMs = Math.min(
    videoDurationMs,
    analysisWindow.end_ms + (missing - (analysisWindow.start_ms - startMs)),
  );

  if (endMs - startMs < MINIMUM_PEGASUS_CLIP_MS) {
    startMs = Math.max(0, endMs - MINIMUM_PEGASUS_CLIP_MS);
    endMs = startMs + MINIMUM_PEGASUS_CLIP_MS;
  }

  return { start_ms: startMs, end_ms: endMs };
}

