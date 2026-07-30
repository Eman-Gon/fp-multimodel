import { getClipById, updateClip } from "@/lib/track-c/repository.ts";
import {
  isFieldTarget,
  ReviewCommandError,
  summarizeReview,
} from "@/lib/track-c/review.ts";
import type { ClipCommand } from "@/lib/track-c/types.ts";

interface RouteContext {
  readonly params: Promise<{ clipId: string }>;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { clipId } = await context.params;
  const clip = getClipById(clipId);
  if (clip === null) {
    return errorResponse(
      404,
      "CLIP_NOT_FOUND",
      `Clip ${clipId} was not found.`,
    );
  }

  return Response.json(
    { data: clip, review_summary: summarizeReview(clip) },
    { headers: NO_STORE_HEADERS },
  );
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { clipId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be JSON.");
  }

  if (!isClipCommand(body)) {
    return errorResponse(
      400,
      "INVALID_COMMAND",
      "Request body is not a supported clip review command.",
    );
  }

  try {
    const clip = updateClip(clipId, body);
    if (clip === null) {
      return errorResponse(
        404,
        "CLIP_NOT_FOUND",
        `Clip ${clipId} was not found.`,
      );
    }
    return Response.json(
      { data: clip, review_summary: summarizeReview(clip) },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof ReviewCommandError) {
      return errorResponse(
        error.status,
        error.code,
        error.message,
        error.details,
      );
    }
    throw error;
  }
}

function isClipCommand(value: unknown): value is ClipCommand {
  if (!isRecord(value) || !Number.isSafeInteger(value.expected_version)) {
    return false;
  }
  if (value.command === "confirm_clip") {
    return true;
  }
  if (
    value.command !== "review_field" ||
    !isFieldTarget(value.target) ||
    !isRecord(value.review)
  ) {
    return false;
  }

  const action = value.review.action;
  return (
    action === "accept" ||
    (action === "edit" && "value" in value.review) ||
    (action === "skip" && typeof value.review.reason === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status, headers: NO_STORE_HEADERS },
  );
}
