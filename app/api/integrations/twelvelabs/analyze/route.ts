import type { FinalParticleInstance } from "@/lib/types.ts";
import { draftTrackBAnnotations } from "@/lib/track-b/pipeline.ts";
import { validateTrackAParticle } from "@/lib/track-b/track-a-handoff.ts";
import { TwelveLabsError } from "@/lib/twelvelabs/errors.ts";
import { TWELVELABS_MODEL } from "@/lib/twelvelabs/config.ts";
import type {
  TwelveLabsAnalyzeData,
  TwelveLabsAnalyzeRequest,
} from "@/lib/twelvelabs/contracts.ts";
import {
  createTwelveLabsClient,
  integrationErrorResponse,
  invalidJsonResponse,
  invalidRequestResponse,
  isRecord,
  jsonData,
  readRequiredString,
} from "@/lib/twelvelabs/route-support.ts";
import { TwelveLabsSemanticGestureAnalyzer } from "@/lib/twelvelabs/semantic-analyzer.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseCommand(request);
  if (parsed instanceof Response) {
    return parsed;
  }

  try {
    validateTrackAParticle(
      parsed.particle,
      parsed.video_id,
      parsed.video_duration_ms,
      "particle",
    );
  } catch (error) {
    return invalidRequestResponse(
      error instanceof Error
        ? error.message
        : "The particle payload is invalid.",
    );
  }

  try {
    const client = createTwelveLabsClient();
    const asset = await client.retrieveAsset(parsed.asset_id);
    if (asset.video_id === null) {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_RESPONSE",
        "TwelveLabs did not return the asset video_id metadata.",
        502,
      );
    }
    if (asset.video_id !== parsed.video_id) {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_REQUEST",
        "The TwelveLabs asset belongs to a different video_id.",
        400,
      );
    }
    if (asset.status !== "ready") {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_REQUEST",
        "The TwelveLabs asset is not ready for analysis.",
        409,
        asset.status === "processing",
      );
    }
    const semanticAnalyzer = new TwelveLabsSemanticGestureAnalyzer({
      client,
      resolveVideo(videoId) {
        if (videoId !== parsed.video_id) {
          throw new TwelveLabsError(
            "TWELVELABS_INVALID_REQUEST",
            "The TwelveLabs asset does not belong to the requested video.",
            400,
          );
        }
        return {
          asset_id: parsed.asset_id,
          video_duration_ms: parsed.video_duration_ms,
        };
      },
    });

    let annotations;
    try {
      annotations = await draftTrackBAnnotations(
        {
          video_id: parsed.video_id,
          video_duration_ms: parsed.video_duration_ms,
          particle_instances: [parsed.particle],
        },
        {
          semanticAnalyzer,
          motionAnalyzer: {
            async detectMotion() {
              return [];
            },
          },
        },
      );
    } catch (error) {
      if (error instanceof TwelveLabsError) {
        throw error;
      }
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_RESPONSE",
        "TwelveLabs returned a gesture response that failed validation.",
        502,
      );
    }

    const annotation = annotations[0];
    if (annotation === undefined) {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_RESPONSE",
        "TwelveLabs did not return a gesture annotation.",
        502,
      );
    }

    const data = {
      provider: "twelvelabs",
      model: TWELVELABS_MODEL,
      video_id: parsed.video_id,
      instance_id: parsed.particle.instance_id,
      asset_id: parsed.asset_id,
      annotation,
    } satisfies TwelveLabsAnalyzeData;
    return jsonData(data);
  } catch (error) {
    return integrationErrorResponse(error, {
      video_id: parsed.video_id,
      instance_id: parsed.particle.instance_id,
    });
  }
}

async function parseCommand(
  request: Request,
): Promise<TwelveLabsAnalyzeRequest | Response> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return invalidJsonResponse();
  }
  if (!isRecord(value)) {
    return invalidRequestResponse("Request body must be a JSON object.");
  }

  const videoId = readRequiredString(value, "video_id");
  const assetId = readRequiredString(value, "asset_id");
  const duration = value.video_duration_ms;
  if (
    videoId === null ||
    assetId === null ||
    !Number.isSafeInteger(duration) ||
    typeof duration !== "number" ||
    duration <= 0
  ) {
    return invalidRequestResponse(
      "video_id, asset_id, and a positive integer video_duration_ms are required.",
    );
  }
  if (!isRecord(value.particle)) {
    return invalidRequestResponse("particle must be an object.");
  }
  const instanceId = value.instance_id;
  if (
    instanceId !== undefined &&
    (typeof instanceId !== "string" ||
      instanceId !== value.particle.instance_id)
  ) {
    return invalidRequestResponse(
      "instance_id must match particle.instance_id when provided.",
    );
  }

  return {
    video_id: videoId,
    asset_id: assetId,
    video_duration_ms: duration,
    particle: value.particle as unknown as FinalParticleInstance,
  };
}
