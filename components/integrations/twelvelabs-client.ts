import type { TimeRange } from "@/lib/types.ts";
import {
  GESTURE_REGIONS,
  GESTURE_TYPES,
  type GestureRegion,
  type GestureType,
} from "@/lib/vocab.ts";

export const TWELVELABS_STATUS_ENDPOINT =
  "/api/integrations/twelvelabs/status";
export const TWELVELABS_INDEX_ENDPOINT =
  "/api/integrations/twelvelabs/index";
export const TWELVELABS_ANALYZE_ENDPOINT =
  "/api/integrations/twelvelabs/analyze";

export interface TwelveLabsConnectionStatus {
  readonly configured: boolean;
}

export type TwelveLabsIndexStatus = "processing" | "ready" | "failed";

export interface TwelveLabsIndexResult {
  readonly status: TwelveLabsIndexStatus;
}

export interface TwelveLabsGestureSuggestion {
  readonly gesture_type: GestureType;
  readonly gesture_region: GestureRegion | null;
  readonly start_ms: number | null;
  readonly end_ms: number | null;
  readonly confidence: number;
  readonly provenance: string;
}

export interface TwelveLabsAnalyzeRequest {
  readonly video_id: string;
  readonly analysis_window: TimeRange;
}

type Fetcher = typeof fetch;

export class TwelveLabsUiRequestError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "TwelveLabsUiRequestError";
    this.status = status;
  }
}

export async function getTwelveLabsConnectionStatus(
  fetcher: Fetcher = fetch,
): Promise<TwelveLabsConnectionStatus> {
  const response = await fetcher(TWELVELABS_STATUS_ENDPOINT, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new TwelveLabsUiRequestError(
      "Connection status could not be loaded.",
      response.status,
    );
  }

  return parseConnectionStatusPayload(payload);
}

export async function startTwelveLabsIndex(
  videoId: string,
  fetcher: Fetcher = fetch,
): Promise<TwelveLabsIndexResult> {
  const normalizedVideoId = requireVideoId(videoId);
  const response = await fetcher(TWELVELABS_INDEX_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ video_id: normalizedVideoId }),
  });
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new TwelveLabsUiRequestError(
      "The server could not start indexing.",
      response.status,
    );
  }

  return parseIndexPayload(payload, normalizedVideoId, response.status);
}

export async function analyzeTwelveLabsGesture(
  request: TwelveLabsAnalyzeRequest,
  fetcher: Fetcher = fetch,
): Promise<TwelveLabsGestureSuggestion> {
  const normalizedVideoId = requireVideoId(request.video_id);
  assertTimeRange(request.analysis_window, "analysis_window");

  const response = await fetcher(TWELVELABS_ANALYZE_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_id: normalizedVideoId,
      analysis_window: request.analysis_window,
    }),
  });
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new TwelveLabsUiRequestError(
      "The server could not analyze this window.",
      response.status,
    );
  }

  return parseGestureSuggestionPayload(
    payload,
    normalizedVideoId,
    request.analysis_window,
  );
}

export function parseConnectionStatusPayload(
  payload: unknown,
): TwelveLabsConnectionStatus {
  const data = unwrapData(payload);
  if (typeof data === "boolean") {
    return { configured: data };
  }
  if (!isRecord(data)) {
    throw invalidResponse("connection status");
  }

  const configured =
    typeof data.configured === "boolean"
      ? data.configured
      : typeof data.api_key_configured === "boolean"
        ? data.api_key_configured
        : null;
  if (configured !== null) {
    return { configured };
  }

  const status = stringValue(data.status);
  if (
    status === "configured" ||
    status === "connected" ||
    status === "ready"
  ) {
    return { configured: true };
  }
  if (
    status === "unconfigured" ||
    status === "missing" ||
    status === "disconnected"
  ) {
    return { configured: false };
  }

  throw invalidResponse("connection status");
}

export function parseIndexPayload(
  payload: unknown,
  expectedVideoId: string,
  responseStatus = 200,
): TwelveLabsIndexResult {
  const data = unwrapData(payload);
  if (data === null) {
    return { status: responseStatus === 202 ? "processing" : "ready" };
  }
  if (!isRecord(data)) {
    throw invalidResponse("index");
  }

  assertMatchingVideoId(data, expectedVideoId);
  const rawStatus = stringValue(data.status ?? data.state);

  if (
    rawStatus === "processing" ||
    rawStatus === "pending" ||
    rawStatus === "queued" ||
    rawStatus === "indexing"
  ) {
    return { status: "processing" };
  }
  if (
    rawStatus === "ready" ||
    rawStatus === "completed" ||
    rawStatus === "complete" ||
    rawStatus === "indexed"
  ) {
    return { status: "ready" };
  }
  if (
    rawStatus === "failed" ||
    rawStatus === "error" ||
    rawStatus === "cancelled"
  ) {
    return { status: "failed" };
  }
  if (rawStatus === null) {
    return { status: responseStatus === 202 ? "processing" : "ready" };
  }

  throw invalidResponse("index");
}

export function parseGestureSuggestionPayload(
  payload: unknown,
  expectedVideoId: string,
  analysisWindow: TimeRange,
): TwelveLabsGestureSuggestion {
  assertTimeRange(analysisWindow, "analysis_window");
  const envelope = unwrapData(payload);
  if (!isRecord(envelope)) {
    throw invalidResponse("gesture analysis");
  }
  assertMatchingVideoId(envelope, expectedVideoId);

  const data = nestedSuggestion(envelope);
  assertMatchingVideoId(data, expectedVideoId);

  const gestureTypeField = fieldRecord(data.gesture_type);
  const gestureTypeValue = fieldValue(data.gesture_type);
  if (!isGestureType(gestureTypeValue)) {
    throw invalidResponse("gesture analysis");
  }

  const gestureRegionValue = fieldValue(data.gesture_region);
  const boundaries = extractBoundaries(data);
  const confidence =
    numberValue(data.confidence) ??
    numberValue(gestureTypeField?.confidence) ??
    extractPegasusConfidence(data);
  if (
    confidence === null ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw invalidResponse("gesture analysis");
  }

  const provenanceValue =
    stringValue(data.provenance) ??
    stringValue(data.source) ??
    stringValue(gestureTypeField?.source) ??
    "pegasus";
  const provenance =
    provenanceValue.toLowerCase() === "pegasus"
      ? "Pegasus"
      : provenanceValue;

  if (gestureTypeValue === "none") {
    if (
      gestureRegionValue !== null &&
      gestureRegionValue !== undefined
    ) {
      throw invalidResponse("gesture analysis");
    }
    if (boundaries.start_ms !== null || boundaries.end_ms !== null) {
      throw invalidResponse("gesture analysis");
    }
    return {
      gesture_type: "none",
      gesture_region: null,
      start_ms: null,
      end_ms: null,
      confidence,
      provenance,
    };
  }

  if (!isGestureRegion(gestureRegionValue)) {
    throw invalidResponse("gesture analysis");
  }
  if (boundaries.start_ms === null || boundaries.end_ms === null) {
    throw invalidResponse("gesture analysis");
  }
  const segment = {
    start_ms: boundaries.start_ms,
    end_ms: boundaries.end_ms,
  };
  assertTimeRange(segment, "gesture segment");
  if (
    segment.start_ms < analysisWindow.start_ms ||
    segment.end_ms > analysisWindow.end_ms
  ) {
    throw invalidResponse("gesture analysis");
  }

  return {
    gesture_type: gestureTypeValue,
    gesture_region: gestureRegionValue,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    confidence,
    provenance,
  };
}

function nestedSuggestion(envelope: Record<string, unknown>) {
  const nested =
    (isRecord(envelope.annotation) ? envelope.annotation : null) ??
    (isRecord(envelope.result) ? envelope.result : null) ??
    (isRecord(envelope.suggestion) ? envelope.suggestion : null) ??
    envelope;
  return nested;
}

function extractBoundaries(data: Record<string, unknown>): {
  readonly start_ms: number | null;
  readonly end_ms: number | null;
} {
  const directStart = nullableInteger(data.start_ms);
  const directEnd = nullableInteger(data.end_ms);
  if (directStart !== undefined || directEnd !== undefined) {
    return {
      start_ms: directStart ?? null,
      end_ms: directEnd ?? null,
    };
  }

  const segment = fieldRecord(data.segment);
  if (segment !== null) {
    return {
      start_ms: nullableInteger(segment.start_ms) ?? null,
      end_ms: nullableInteger(segment.end_ms) ?? null,
    };
  }

  const boundaryValue = fieldValue(data.gesture_boundaries);
  if (isRecord(boundaryValue)) {
    return {
      start_ms: nullableInteger(boundaryValue.start_ms) ?? null,
      end_ms: nullableInteger(boundaryValue.end_ms) ?? null,
    };
  }

  return { start_ms: null, end_ms: null };
}

function extractPegasusConfidence(data: Record<string, unknown>): number | null {
  const evidence = fieldRecord(data.model_evidence);
  const pegasus = fieldRecord(evidence?.pegasus);
  return numberValue(pegasus?.confidence);
}

function fieldValue(value: unknown): unknown {
  return isRecord(value) && "value" in value ? value.value : value;
}

function fieldRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function assertMatchingVideoId(
  data: Record<string, unknown>,
  expectedVideoId: string,
): void {
  if (
    typeof data.video_id === "string" &&
    data.video_id !== expectedVideoId
  ) {
    throw new TwelveLabsUiRequestError(
      "The server returned analysis for a different video.",
    );
  }
}

function requireVideoId(videoId: string): string {
  const normalized = videoId.trim();
  if (normalized.length === 0) {
    throw new TwelveLabsUiRequestError("Choose or enter a video_id first.");
  }
  return normalized;
}

function assertTimeRange(value: TimeRange, label: string): void {
  if (
    !Number.isSafeInteger(value.start_ms) ||
    !Number.isSafeInteger(value.end_ms) ||
    value.start_ms < 0 ||
    value.end_ms <= value.start_ms
  ) {
    throw new TwelveLabsUiRequestError(
      `${label} must use non-negative absolute integer milliseconds with end after start.`,
    );
  }
}

function unwrapData(payload: unknown): unknown {
  if (isRecord(payload) && "data" in payload) {
    return payload.data;
  }
  return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidResponse("JSON");
  }
}

function invalidResponse(subject: string): TwelveLabsUiRequestError {
  return new TwelveLabsUiRequestError(
    `The server returned an invalid ${subject} response.`,
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().toLowerCase()
    : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function nullableInteger(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return Number.isSafeInteger(value) ? (value as number) : undefined;
}

function isGestureType(value: unknown): value is GestureType {
  return (
    typeof value === "string" &&
    (GESTURE_TYPES as readonly string[]).includes(value)
  );
}

function isGestureRegion(value: unknown): value is GestureRegion {
  return (
    typeof value === "string" &&
    (GESTURE_REGIONS as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
