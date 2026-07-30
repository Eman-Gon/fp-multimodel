import { createGestureAnalysisWindow } from "@/lib/track-b/analysis-window.ts";
import { parsePegasusGesture } from "@/lib/track-b/pegasus.ts";
import type {
  ApiErrorResponse,
  TwelveLabsAnalyzeRequest,
  TwelveLabsIndexData,
  TwelveLabsIndexRequest,
  TwelveLabsIndexWorkflowRequest,
  TwelveLabsStatusData,
} from "@/lib/twelvelabs/contracts.ts";
import {
  TWELVELABS_ANALYZE_ENDPOINT,
  TWELVELABS_INDEX_ENDPOINT,
  TWELVELABS_STATUS_ENDPOINT,
} from "@/lib/twelvelabs/contracts.ts";
import type {
  GestureAnnotationDraft,
  SemanticGestureProviderEvidence,
  TimeRange,
} from "@/lib/types.ts";
import {
  GESTURE_REGIONS,
  GESTURE_TYPES,
  type GestureRegion,
  type GestureType,
} from "@/lib/vocab.ts";

export type TwelveLabsConnectionStatus = TwelveLabsStatusData;
export type TwelveLabsIndexResult = TwelveLabsIndexData;

export interface TwelveLabsGestureSuggestion {
  readonly video_id: string;
  readonly instance_id: string;
  readonly asset_id: string;
  readonly gesture_type: GestureType;
  readonly gesture_region: GestureRegion | null;
  readonly start_ms: number | null;
  readonly end_ms: number | null;
  readonly confidence: number;
  readonly confirmed: false;
  readonly provenance: SemanticGestureProviderEvidence;
  readonly annotation: GestureAnnotationDraft;
}

export interface TwelveLabsIndexWorkflowOptions {
  readonly poll_interval_ms?: number;
  readonly max_poll_attempts?: number;
}

type Fetcher = typeof fetch;

export class TwelveLabsUiRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly retryable: boolean;
  readonly video_id: string | null;
  readonly instance_id: string | null;

  constructor(
    message: string,
    options: {
      readonly status?: number | null;
      readonly code?: string | null;
      readonly retryable?: boolean;
      readonly video_id?: string | null;
      readonly instance_id?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "TwelveLabsUiRequestError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? false;
    this.video_id = options.video_id ?? null;
    this.instance_id = options.instance_id ?? null;
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
    throw responseError(
      response,
      payload,
      "Connection status could not be loaded.",
    );
  }
  return parseConnectionStatusPayload(payload);
}

export async function sendTwelveLabsIndexCommand(
  request: TwelveLabsIndexRequest,
  fetcher: Fetcher = fetch,
): Promise<TwelveLabsIndexData> {
  validateIndexRequest(request);
  const response = await fetcher(TWELVELABS_INDEX_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw responseError(
      response,
      payload,
      "The server could not complete the indexing request.",
    );
  }
  return parseIndexPayload(payload, request, response.status);
}

/**
 * Runs the route's explicit upload → asset poll → index → index poll state
 * machine. Provider identifiers are retained between calls and never replace
 * the research video's stable video_id.
 */
export async function startTwelveLabsIndex(
  request: TwelveLabsIndexWorkflowRequest,
  fetcher: Fetcher = fetch,
  options: TwelveLabsIndexWorkflowOptions = {},
): Promise<TwelveLabsIndexResult> {
  const pollIntervalMs = options.poll_interval_ms ?? 2_000;
  const maxPollAttempts = options.max_poll_attempts ?? 150;
  assertPollingOptions(pollIntervalMs, maxPollAttempts);

  let upload = await sendTwelveLabsIndexCommand(
    {
      action: "upload",
      video_id: request.video_id,
      index_id: request.index_id,
      video_url: request.video_url,
      ...(request.filename === undefined
        ? {}
        : { filename: request.filename }),
    },
    fetcher,
  );
  upload = await pollUntilSettled(
    upload,
    () =>
      sendTwelveLabsIndexCommand(
        {
          action: "status",
          video_id: request.video_id,
          index_id: request.index_id,
          asset_id: upload.asset_id,
        },
        fetcher,
      ),
    pollIntervalMs,
    maxPollAttempts,
  );
  if (upload.status === "failed") {
    return upload;
  }

  const index = await sendTwelveLabsIndexCommand(
    {
      action: "index",
      video_id: request.video_id,
      index_id: request.index_id,
      asset_id: upload.asset_id,
    },
    fetcher,
  );
  if (index.stage !== "index" || index.indexed_asset_id === null) {
    throw invalidResponse("index");
  }
  const indexedAssetId = index.indexed_asset_id;
  return pollUntilSettled(
    index,
    () =>
      sendTwelveLabsIndexCommand(
        {
          action: "status",
          video_id: request.video_id,
          index_id: request.index_id,
          asset_id: index.asset_id,
          indexed_asset_id: indexedAssetId,
        },
        fetcher,
      ),
    pollIntervalMs,
    maxPollAttempts,
  );
}

export async function analyzeTwelveLabsGesture(
  request: TwelveLabsAnalyzeRequest,
  fetcher: Fetcher = fetch,
): Promise<TwelveLabsGestureSuggestion> {
  validateAnalyzeRequest(request);
  const response = await fetcher(TWELVELABS_ANALYZE_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw responseError(
      response,
      payload,
      "The server could not analyze this particle.",
    );
  }
  return parseGestureSuggestionPayload(payload, request);
}

export function parseConnectionStatusPayload(
  payload: unknown,
): TwelveLabsConnectionStatus {
  const data = unwrapData(payload);
  if (!isRecord(data)) {
    throw invalidResponse("connection status");
  }
  if (
    data.provider !== "twelvelabs" ||
    typeof data.configured !== "boolean" ||
    data.api_version !== "v1.3" ||
    data.model !== "pegasus1.5" ||
    !isRecord(data.capabilities) ||
    data.capabilities.direct_upload !== true ||
    data.capabilities.indexing !== true ||
    data.capabilities.structured_gesture_analysis !== true
  ) {
    throw invalidResponse("connection status");
  }
  return {
    provider: "twelvelabs",
    configured: data.configured,
    api_version: "v1.3",
    model: "pegasus1.5",
    capabilities: {
      direct_upload: true,
      indexing: true,
      structured_gesture_analysis: true,
    },
  };
}

export function parseIndexPayload(
  payload: unknown,
  request: TwelveLabsIndexRequest,
  responseStatus = 200,
): TwelveLabsIndexData {
  const data = unwrapData(payload);
  if (
    !isRecord(data) ||
    data.provider !== "twelvelabs" ||
    data.video_id !== request.video_id ||
    data.index_id !== request.index_id ||
    typeof data.asset_id !== "string" ||
    data.asset_id.length === 0 ||
    (data.indexed_asset_id !== null &&
      (typeof data.indexed_asset_id !== "string" ||
        data.indexed_asset_id.length === 0)) ||
    (data.stage !== "upload" && data.stage !== "index") ||
    (data.status !== "processing" &&
      data.status !== "ready" &&
      data.status !== "failed")
  ) {
    throw invalidResponse("index");
  }
  if (
    request.action !== "upload" &&
    data.asset_id !== request.asset_id
  ) {
    throw new TwelveLabsUiRequestError(
      "The server returned indexing state for a different asset.",
    );
  }
  const expectedStage =
    request.action === "upload" ||
    (request.action === "status" &&
      request.indexed_asset_id === undefined)
      ? "upload"
      : "index";
  if (data.stage !== expectedStage) {
    throw invalidResponse("index");
  }
  if (
    (data.status === "processing" && responseStatus !== 202) ||
    (data.status !== "processing" && responseStatus !== 200)
  ) {
    throw invalidResponse("index HTTP status");
  }
  if (
    data.stage === "upload" &&
    data.indexed_asset_id !== null
  ) {
    throw invalidResponse("index");
  }
  if (
    data.stage === "index" &&
    data.indexed_asset_id === null
  ) {
    throw invalidResponse("index");
  }

  const common = {
    provider: "twelvelabs",
    video_id: data.video_id,
    index_id: data.index_id,
    asset_id: data.asset_id,
    status: data.status,
  } as const;
  return data.stage === "upload"
    ? {
        ...common,
        indexed_asset_id: null,
        stage: "upload",
      }
    : {
        ...common,
        indexed_asset_id: data.indexed_asset_id as string,
        stage: "index",
      };
}

export function parseGestureSuggestionPayload(
  payload: unknown,
  request: TwelveLabsAnalyzeRequest,
): TwelveLabsGestureSuggestion {
  const data = unwrapData(payload);
  if (
    !isRecord(data) ||
    data.provider !== "twelvelabs" ||
    data.model !== "pegasus1.5" ||
    data.video_id !== request.video_id ||
    data.instance_id !== request.particle.instance_id ||
    data.asset_id !== request.asset_id ||
    !isRecord(data.annotation)
  ) {
    throw invalidResponse("gesture analysis");
  }

  const annotation = validateAnnotation(
    data.annotation,
    request,
  );
  const type = annotation.gesture_type.value;
  const region = annotation.gesture_region.value;
  const boundaries = annotation.gesture_boundaries.value;
  const provider = annotation.model_evidence.provider;
  if (provider === undefined) {
    throw invalidResponse("gesture provenance");
  }

  return {
    video_id: data.video_id,
    instance_id: data.instance_id,
    asset_id: data.asset_id,
    gesture_type: type,
    gesture_region: region,
    start_ms: boundaries?.start_ms ?? null,
    end_ms: boundaries?.end_ms ?? null,
    confidence:
      annotation.gesture_type.confidence ??
      annotation.model_evidence.pegasus.confidence,
    confirmed: false,
    provenance: provider,
    annotation,
  };
}

function validateAnnotation(
  value: Record<string, unknown>,
  request: TwelveLabsAnalyzeRequest,
): GestureAnnotationDraft {
  if (
    value.video_id !== request.video_id ||
    value.instance_id !== request.particle.instance_id ||
    !isTimeRange(value.analysis_window)
  ) {
    throw invalidResponse("gesture annotation identity");
  }
  const expectedWindow = createGestureAnalysisWindow(
    request.particle,
    request.video_duration_ms,
  );
  if (
    value.analysis_window.start_ms !== expectedWindow.start_ms ||
    value.analysis_window.end_ms !== expectedWindow.end_ms
  ) {
    throw invalidResponse("gesture analysis window");
  }

  const present = draftField(value.gesture_present);
  const type = draftField(value.gesture_type);
  const region = draftField(value.gesture_region);
  const boundaries = draftField(value.gesture_boundaries);
  if (
    typeof present.value !== "boolean" ||
    !isGestureType(type.value) ||
    (region.value !== null && !isGestureRegion(region.value)) ||
    (boundaries.value !== null && !isTimeRange(boundaries.value)) ||
    !isRecord(value.model_evidence) ||
    !isRecord(value.model_evidence.pegasus) ||
    !Array.isArray(value.model_evidence.mediapipe_intervals) ||
    !value.model_evidence.mediapipe_intervals.every(
      (interval) =>
        isTimeRange(interval) &&
        interval.start_ms >= expectedWindow.start_ms &&
        interval.end_ms <= expectedWindow.end_ms,
    )
  ) {
    throw invalidResponse("gesture annotation");
  }
  if (
    type.value === "none"
      ? region.value !== null || boundaries.value !== null || present.value
      : region.value === null || boundaries.value === null || !present.value
  ) {
    throw invalidResponse("gesture annotation");
  }
  if (
    boundaries.value !== null &&
    (boundaries.value.start_ms < expectedWindow.start_ms ||
      boundaries.value.end_ms > expectedWindow.end_ms)
  ) {
    throw invalidResponse("gesture timing");
  }

  const pegasus = value.model_evidence.pegasus;
  if (
    pegasus.gesture_type !== type.value ||
    pegasus.gesture_region !== region.value ||
    typeof pegasus.confidence !== "number" ||
    !Number.isFinite(pegasus.confidence) ||
    pegasus.confidence < 0 ||
    pegasus.confidence > 1 ||
    (type.value === "none"
      ? pegasus.segment !== null
      : !isTimeRange(pegasus.segment)) ||
    (isTimeRange(pegasus.segment) &&
      (pegasus.segment.start_ms < expectedWindow.start_ms ||
        pegasus.segment.end_ms > expectedWindow.end_ms))
  ) {
    throw invalidResponse("Pegasus evidence");
  }

  const provider = value.model_evidence.provider;
  if (!isRecord(provider)) {
    throw invalidResponse("gesture provenance");
  }
  validateProviderEvidence(
    provider,
    request,
    expectedWindow,
    pegasus,
  );

  return structuredClone(value) as unknown as GestureAnnotationDraft;
}

function validateProviderEvidence(
  provider: Record<string, unknown>,
  request: TwelveLabsAnalyzeRequest,
  analysisWindow: TimeRange,
  pegasusEvidence: Record<string, unknown>,
): void {
  if (
    provider.provider !== "twelvelabs" ||
    provider.model !== "pegasus1.5" ||
    provider.asset_id !== request.asset_id ||
    !isTimeRange(provider.provider_window) ||
    provider.provider_window.start_ms > analysisWindow.start_ms ||
    provider.provider_window.end_ms < analysisWindow.end_ms ||
    provider.provider_window.end_ms > request.video_duration_ms ||
    (provider.response_id !== null &&
      typeof provider.response_id !== "string") ||
    (provider.finish_reason !== null &&
      typeof provider.finish_reason !== "string") ||
    !isRecord(provider.raw_response)
  ) {
    throw invalidResponse("gesture provenance");
  }
  const rawKeys = Object.keys(provider.raw_response);
  if (
    rawKeys.length !== 3 ||
    !rawKeys.includes("id") ||
    !rawKeys.includes("data") ||
    !rawKeys.includes("finish_reason") ||
    rawKeys.some(
      (key) => !["id", "data", "finish_reason"].includes(key),
    ) ||
    provider.raw_response.id !== provider.response_id ||
    provider.raw_response.finish_reason !== provider.finish_reason ||
    typeof provider.raw_response.data !== "string"
  ) {
    throw invalidResponse("gesture provenance");
  }

  try {
    const rawPegasus = parsePegasusGesture(
      provider.raw_response.data,
      analysisWindow,
    );
    if (
      rawPegasus.gesture_type !== pegasusEvidence.gesture_type ||
      rawPegasus.gesture_region !== pegasusEvidence.gesture_region ||
      rawPegasus.confidence !== pegasusEvidence.confidence ||
      !sameNullableRange(rawPegasus.segment, pegasusEvidence.segment)
    ) {
      throw invalidResponse("gesture provenance");
    }
  } catch (error) {
    if (error instanceof TwelveLabsUiRequestError) {
      throw error;
    }
    throw invalidResponse("gesture provenance");
  }
}

function draftField(value: unknown): Record<string, unknown> {
  if (
    !isRecord(value) ||
    value.confirmed !== false ||
    (value.source !== "pegasus" && value.source !== "mediapipe") ||
    (value.confidence !== null &&
      (typeof value.confidence !== "number" ||
        !Number.isFinite(value.confidence) ||
        value.confidence < 0 ||
        value.confidence > 1))
  ) {
    throw invalidResponse("unconfirmed gesture field");
  }
  return value;
}

function sameNullableRange(left: unknown, right: unknown): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    isTimeRange(left) &&
    isTimeRange(right) &&
    left.start_ms === right.start_ms &&
    left.end_ms === right.end_ms
  );
}

async function pollUntilSettled(
  initial: TwelveLabsIndexData,
  poll: () => Promise<TwelveLabsIndexData>,
  pollIntervalMs: number,
  maxPollAttempts: number,
): Promise<TwelveLabsIndexData> {
  let current = initial;
  for (
    let attempt = 0;
    current.status === "processing" && attempt < maxPollAttempts;
    attempt += 1
  ) {
    if (pollIntervalMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, pollIntervalMs);
      });
    }
    current = await poll();
  }
  if (current.status === "processing") {
    throw new TwelveLabsUiRequestError(
      "TwelveLabs is still processing the video. Check again later.",
      {
        code: "TWELVELABS_TIMEOUT",
        retryable: true,
        video_id: current.video_id,
      },
    );
  }
  return current;
}

function validateIndexRequest(request: TwelveLabsIndexRequest): void {
  requireNonEmpty(request.video_id, "video_id");
  requireNonEmpty(request.index_id, "index_id");
  if (request.action === "upload") {
    requireNonEmpty(request.video_url, "video_url");
    let url: URL;
    try {
      url = new URL(request.video_url);
    } catch {
      throw new TwelveLabsUiRequestError(
        "video_url must be a public HTTPS URL.",
      );
    }
    if (url.protocol !== "https:") {
      throw new TwelveLabsUiRequestError(
        "video_url must be a public HTTPS URL.",
      );
    }
    return;
  }
  requireNonEmpty(request.asset_id, "asset_id");
  if (
    request.action === "status" &&
    request.indexed_asset_id !== undefined
  ) {
    requireNonEmpty(request.indexed_asset_id, "indexed_asset_id");
  }
}

function validateAnalyzeRequest(request: TwelveLabsAnalyzeRequest): void {
  requireNonEmpty(request.video_id, "video_id");
  requireNonEmpty(request.asset_id, "asset_id");
  if (
    !Number.isSafeInteger(request.video_duration_ms) ||
    request.video_duration_ms <= 0 ||
    request.particle.instance_id !==
      `${request.video_id}:${request.particle.utterance_id}` ||
    (request.instance_id !== undefined &&
      request.instance_id !== request.particle.instance_id) ||
    request.particle.confirmed !== false
  ) {
    throw new TwelveLabsUiRequestError(
      "The analysis request has invalid video or particle identity.",
    );
  }
  assertTimeRange(
    {
      start_ms: request.particle.fp_start_ms,
      end_ms: request.particle.fp_end_ms,
    },
    "particle timing",
  );
  if (request.particle.fp_end_ms > request.video_duration_ms) {
    throw new TwelveLabsUiRequestError(
      "Particle timing must stay inside the source video.",
    );
  }
}

function assertPollingOptions(
  pollIntervalMs: number,
  maxPollAttempts: number,
): void {
  if (
    !Number.isSafeInteger(pollIntervalMs) ||
    pollIntervalMs < 0 ||
    !Number.isSafeInteger(maxPollAttempts) ||
    maxPollAttempts < 1
  ) {
    throw new RangeError(
      "Polling options must be non-negative integers with at least one attempt.",
    );
  }
}

function assertTimeRange(value: TimeRange, label: string): void {
  if (!isTimeRange(value)) {
    throw new TwelveLabsUiRequestError(
      `${label} must use non-negative absolute integer milliseconds with end after start.`,
    );
  }
}

function isTimeRange(value: unknown): value is TimeRange {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.start_ms) &&
    Number.isSafeInteger(value.end_ms) &&
    (value.start_ms as number) >= 0 &&
    (value.end_ms as number) > (value.start_ms as number)
  );
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TwelveLabsUiRequestError(`${label} must not be empty.`);
  }
  return normalized;
}

function unwrapData(payload: unknown): unknown {
  return isRecord(payload) && "data" in payload ? payload.data : null;
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

function responseError(
  response: Response,
  payload: unknown,
  fallback: string,
): TwelveLabsUiRequestError {
  const error =
    isRecord(payload) && isRecord(payload.error)
      ? (payload as unknown as ApiErrorResponse).error
      : null;
  return new TwelveLabsUiRequestError(
    typeof error?.message === "string" ? error.message : fallback,
    {
      status: response.status,
      code: typeof error?.code === "string" ? error.code : null,
      retryable: error?.details?.retryable === true,
      video_id:
        typeof error?.details?.video_id === "string"
          ? error.details.video_id
          : null,
      instance_id:
        typeof error?.details?.instance_id === "string"
          ? error.details.instance_id
          : null,
    },
  );
}

function invalidResponse(subject: string): TwelveLabsUiRequestError {
  return new TwelveLabsUiRequestError(
    `The server returned an invalid ${subject} response.`,
  );
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
