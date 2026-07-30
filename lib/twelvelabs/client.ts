import {
  TWELVELABS_MODEL,
  type TwelveLabsConfig,
} from "./config.ts";
import { TwelveLabsError } from "./errors.ts";

export type TwelveLabsAssetStatus = "processing" | "ready" | "failed";
export type TwelveLabsIndexedAssetStatus =
  | "pending"
  | "queued"
  | "indexing"
  | "ready"
  | "failed";

export interface TwelveLabsAsset {
  readonly id: string;
  readonly status: TwelveLabsAssetStatus;
  readonly filename: string | null;
  readonly file_type: string | null;
}

export interface TwelveLabsIndexedAsset {
  readonly id: string;
  readonly asset_id: string;
  readonly status: TwelveLabsIndexedAssetStatus;
}

export interface TwelveLabsAnalyzeResponse {
  readonly id: string | null;
  readonly data: string;
  readonly finish_reason: string | null;
  readonly raw_response: unknown;
}

export interface TwelveLabsClientOptions extends TwelveLabsConfig {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

interface CreateAssetCommon {
  readonly video_id: string;
  readonly filename?: string;
}

interface CreateAssetFromUrlRequest extends CreateAssetCommon {
  readonly video_url: string;
}

interface CreateAssetFromFileRequest extends CreateAssetCommon {
  readonly file: Blob;
}

export interface IndexAssetRequest {
  readonly video_id: string;
  readonly index_id: string;
  readonly asset_id: string;
}

export interface AnalyzeStructuredRequest {
  readonly asset_id: string;
  readonly prompt: string;
  readonly response_schema: Readonly<Record<string, unknown>>;
  readonly start_ms: number;
  readonly end_ms: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MINIMUM_PEGASUS_CLIP_MS = 4_000;

export class TwelveLabsClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: TwelveLabsClientOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new TwelveLabsError(
        "TWELVELABS_NOT_CONFIGURED",
        "TwelveLabs is not configured on the server.",
        503,
      );
    }
    this.#apiKey = options.apiKey;
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async createAssetFromUrl(
    request: CreateAssetFromUrlRequest,
  ): Promise<TwelveLabsAsset> {
    assertNonEmpty(request.video_id, "video_id");
    assertPublicVideoUrl(request.video_url);

    const form = new FormData();
    form.set("method", "url");
    form.set("url", request.video_url);
    appendAssetMetadata(form, request);

    const raw = await this.#request("/assets", {
      method: "POST",
      body: form,
    });
    return parseAsset(raw);
  }

  async createAssetFromFile(
    request: CreateAssetFromFileRequest,
  ): Promise<TwelveLabsAsset> {
    assertNonEmpty(request.video_id, "video_id");
    if (request.file.size === 0) {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_REQUEST",
        "The uploaded video file must not be empty.",
        400,
      );
    }

    const form = new FormData();
    form.set("method", "direct");
    form.set(
      "file",
      request.file,
      request.filename ?? inferBlobFilename(request.file),
    );
    appendAssetMetadata(form, request);

    const raw = await this.#request("/assets", {
      method: "POST",
      body: form,
    });
    return parseAsset(raw);
  }

  async retrieveAsset(assetId: string): Promise<TwelveLabsAsset> {
    assertNonEmpty(assetId, "asset_id");
    const raw = await this.#request(`/assets/${encodeURIComponent(assetId)}`, {
      method: "GET",
    });
    return parseAsset(raw);
  }

  async indexAsset(
    request: IndexAssetRequest,
  ): Promise<TwelveLabsIndexedAsset> {
    assertNonEmpty(request.video_id, "video_id");
    assertNonEmpty(request.index_id, "index_id");
    assertNonEmpty(request.asset_id, "asset_id");

    const raw = await this.#request(
      `/indexes/${encodeURIComponent(request.index_id)}/indexed-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: request.asset_id,
          user_metadata: { video_id: request.video_id },
        }),
      },
    );
    const value = parseIndexedAssetIdentity(raw);
    return { ...value, status: "queued" };
  }

  async retrieveIndexedAsset(
    indexId: string,
    indexedAssetId: string,
  ): Promise<TwelveLabsIndexedAsset> {
    assertNonEmpty(indexId, "index_id");
    assertNonEmpty(indexedAssetId, "indexed_asset_id");
    const raw = await this.#request(
      `/indexes/${encodeURIComponent(indexId)}/indexed-assets/${encodeURIComponent(indexedAssetId)}`,
      { method: "GET" },
    );
    return parseIndexedAsset(raw);
  }

  async analyzeStructured(
    request: AnalyzeStructuredRequest,
  ): Promise<TwelveLabsAnalyzeResponse> {
    assertNonEmpty(request.asset_id, "asset_id");
    assertNonEmpty(request.prompt, "prompt");
    assertMilliseconds(request.start_ms, "start_ms");
    assertMilliseconds(request.end_ms, "end_ms");
    if (request.end_ms <= request.start_ms) {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_REQUEST",
        "The analysis end time must be greater than the start time.",
        400,
      );
    }
    if (request.end_ms - request.start_ms < MINIMUM_PEGASUS_CLIP_MS) {
      throw new TwelveLabsError(
        "TWELVELABS_INVALID_REQUEST",
        "TwelveLabs Pegasus requires an analysis window of at least 4000ms.",
        400,
      );
    }

    const raw = await this.#request("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_name: TWELVELABS_MODEL,
        video: {
          type: "asset_id",
          asset_id: request.asset_id,
        },
        prompt_v2: {
          input_text: request.prompt,
        },
        temperature: 0,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: request.response_schema,
        },
        max_tokens: 512,
        start_time: request.start_ms / 1_000,
        end_time: request.end_ms / 1_000,
      }),
    });

    const value = asRecord(raw, "TwelveLabs analysis response");
    const data = readString(value, "data");
    return {
      id: readNullableString(value, "id"),
      data,
      finish_reason: readNullableString(value, "finish_reason"),
      raw_response: structuredClone(raw),
    };
  }

  async #request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    const headers = new Headers(init.headers);
    headers.set("x-api-key", this.#apiKey);

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new TwelveLabsError(
          "TWELVELABS_TIMEOUT",
          "TwelveLabs did not respond before the request timed out.",
          504,
          true,
        );
      }
      throw new TwelveLabsError(
        "TWELVELABS_UNAVAILABLE",
        "TwelveLabs is temporarily unavailable.",
        503,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw providerErrorForStatus(response.status);
    }
    return readResponseBody(response);
  }
}

function appendAssetMetadata(
  form: FormData,
  request: CreateAssetCommon,
): void {
  if (request.filename !== undefined) {
    assertNonEmpty(request.filename, "filename");
    form.set("filename", request.filename);
  }
  form.set("user_metadata", JSON.stringify({ video_id: request.video_id }));
}

function inferBlobFilename(file: Blob): string {
  if ("name" in file && typeof file.name === "string" && file.name.length > 0) {
    return file.name;
  }
  return "video";
}

function parseAsset(raw: unknown): TwelveLabsAsset {
  const value = asRecord(raw, "TwelveLabs asset response");
  const status = readString(value, "status");
  if (!isAssetStatus(status)) {
    throw invalidProviderResponse("TwelveLabs returned an unknown asset status.");
  }
  return {
    id: readString(value, "_id"),
    status,
    filename: readNullableString(value, "filename"),
    file_type: readNullableString(value, "file_type"),
  };
}

function parseIndexedAssetIdentity(
  raw: unknown,
): Pick<TwelveLabsIndexedAsset, "id" | "asset_id"> {
  const value = asRecord(raw, "TwelveLabs indexed asset response");
  return {
    id: readString(value, "_id"),
    asset_id: readString(value, "asset_id"),
  };
}

function parseIndexedAsset(raw: unknown): TwelveLabsIndexedAsset {
  const value = asRecord(raw, "TwelveLabs indexed asset response");
  const identity = parseIndexedAssetIdentity(value);
  const status = readString(value, "status");
  if (!isIndexedAssetStatus(status)) {
    throw invalidProviderResponse(
      "TwelveLabs returned an unknown indexing status.",
    );
  }
  return { ...identity, status };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidProviderResponse(`${label} was not a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw invalidProviderResponse(
      `TwelveLabs response field ${key} was not a string.`,
    );
  }
  return field;
}

function readNullableString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const field = value[key];
  if (field === undefined || field === null) {
    return null;
  }
  if (typeof field !== "string") {
    throw invalidProviderResponse(
      `TwelveLabs response field ${key} was invalid.`,
    );
  }
  return field;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidProviderResponse(
      "TwelveLabs returned a response that was not valid JSON.",
    );
  }
}

function providerErrorForStatus(status: number): TwelveLabsError {
  if (status === 401 || status === 403) {
    return new TwelveLabsError(
      "TWELVELABS_UNAUTHORIZED",
      "TwelveLabs rejected the server credential.",
      502,
    );
  }
  if (status === 404) {
    return new TwelveLabsError(
      "TWELVELABS_NOT_FOUND",
      "The requested TwelveLabs asset or index was not found.",
      404,
    );
  }
  if (status === 429) {
    return new TwelveLabsError(
      "TWELVELABS_RATE_LIMITED",
      "TwelveLabs rate-limited the request. Try again later.",
      503,
      true,
    );
  }
  return new TwelveLabsError(
    "TWELVELABS_UNAVAILABLE",
    "TwelveLabs could not complete the request.",
    status >= 500 ? 503 : 502,
    status >= 500,
  );
}

function invalidProviderResponse(message: string): TwelveLabsError {
  return new TwelveLabsError(
    "TWELVELABS_INVALID_RESPONSE",
    message,
    502,
  );
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new TwelveLabsError(
      "TWELVELABS_INVALID_REQUEST",
      `${label} must not be empty.`,
      400,
    );
  }
}

function assertMilliseconds(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TwelveLabsError(
      "TWELVELABS_INVALID_REQUEST",
      `${label} must be a non-negative integer in milliseconds.`,
      400,
    );
  }
}

function assertPublicVideoUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TwelveLabsError(
      "TWELVELABS_INVALID_REQUEST",
      "video_url must be a valid public HTTPS URL.",
      400,
    );
  }
  if (parsed.protocol !== "https:") {
    throw new TwelveLabsError(
      "TWELVELABS_INVALID_REQUEST",
      "video_url must be a valid public HTTPS URL.",
      400,
    );
  }
}

function isAssetStatus(value: string): value is TwelveLabsAssetStatus {
  return value === "processing" || value === "ready" || value === "failed";
}

function isIndexedAssetStatus(
  value: string,
): value is TwelveLabsIndexedAssetStatus {
  return (
    value === "pending" ||
    value === "queued" ||
    value === "indexing" ||
    value === "ready" ||
    value === "failed"
  );
}
