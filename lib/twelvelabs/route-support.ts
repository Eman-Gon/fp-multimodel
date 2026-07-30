import { TwelveLabsClient } from "./client.ts";
import { readTwelveLabsConfig } from "./config.ts";
import type { ApiErrorDetails } from "./contracts.ts";
import { TwelveLabsError } from "./errors.ts";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export function createTwelveLabsClient(): TwelveLabsClient {
  return new TwelveLabsClient(readTwelveLabsConfig());
}

export function jsonData(
  data: unknown,
  init?: ResponseInit,
): Response {
  return Response.json(
    { data },
    {
      ...init,
      headers: {
        ...NO_STORE_HEADERS,
        ...headersToObject(init?.headers),
      },
    },
  );
}

export function integrationErrorResponse(
  error: unknown,
  context: Pick<ApiErrorDetails, "video_id" | "instance_id"> = {},
): Response {
  if (error instanceof TwelveLabsError) {
    return errorResponse(error.httpStatus, error.code, error.message, {
      retryable: error.retryable,
      ...context,
    });
  }
  return errorResponse(
    500,
    "INTEGRATION_ERROR",
    "The TwelveLabs integration could not complete the request.",
    context,
  );
}

export function invalidRequestResponse(message: string): Response {
  return errorResponse(400, "INVALID_REQUEST", message);
}

export function invalidJsonResponse(): Response {
  return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
}

export function errorResponse(
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRequiredString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    return null;
  }
  return field;
}

function headersToObject(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (headers === undefined) {
    return {};
  }
  return Object.fromEntries(new Headers(headers).entries());
}
