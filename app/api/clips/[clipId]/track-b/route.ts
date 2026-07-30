import type { GestureAnnotationDraft } from "@/lib/types.ts";
import { updateClipWithTrackBDrafts } from "@/lib/track-c/repository.ts";
import { ReviewCommandError, summarizeReview } from "@/lib/track-c/review.ts";

interface RouteContext {
  readonly params: Promise<{ clipId: string }>;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

/**
 * Imports a completed, provider-independent B1–B3 draft set into an existing
 * clip shell. The repository performs the optimistic version check and the
 * adapter validates every draft before any review record changes.
 */
export async function POST(
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
  if (!isTrackBImport(body)) {
    return errorResponse(
      400,
      "INVALID_TRACK_B_IMPORT",
      "Request body must contain expected_version and a drafts array.",
    );
  }

  try {
    const clip = updateClipWithTrackBDrafts(
      clipId,
      body.expected_version,
      body.drafts,
    );
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
    if (error instanceof TypeError || error instanceof RangeError) {
      return errorResponse(422, "INVALID_TRACK_B_DRAFT", error.message);
    }
    throw error;
  }
}

function isTrackBImport(
  value: unknown,
): value is {
  readonly expected_version: number;
  readonly drafts: readonly GestureAnnotationDraft[];
} {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.expected_version) &&
    typeof value.expected_version === "number" &&
    value.expected_version >= 0 &&
    Array.isArray(value.drafts)
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
