import assert from "node:assert/strict";
import test from "node:test";

import { PEGASUS_GESTURE_RESPONSE_SCHEMA } from "../lib/track-b/pegasus.ts";
import {
  TWELVELABS_API_BASE_URL,
  getTwelveLabsConfigurationStatus,
  readTwelveLabsConfig,
} from "../lib/twelvelabs/config.ts";
import { TwelveLabsClient } from "../lib/twelvelabs/client.ts";
import { TwelveLabsError } from "../lib/twelvelabs/errors.ts";
import { createTwelveLabsProviderWindow } from "../lib/twelvelabs/semantic-analyzer.ts";

test("server configuration trims the API key without exposing it in status", () => {
  const secret = "sentinel-secret";
  const config = readTwelveLabsConfig({
    TWELVELABS_API_KEY: `  ${secret}  `,
  });
  const status = getTwelveLabsConfigurationStatus({
    TWELVELABS_API_KEY: secret,
  });

  assert.equal(config.apiKey, secret);
  assert.equal(config.baseUrl, TWELVELABS_API_BASE_URL);
  assert.equal(status.configured, true);
  assert.equal(JSON.stringify(status).includes(secret), false);
  assert.deepEqual(status.capabilities, {
    direct_upload: true,
    indexing: true,
    structured_gesture_analysis: true,
  });
});

test("blank server configuration fails with a safe typed error", () => {
  assert.throws(
    () => readTwelveLabsConfig({ TWELVELABS_API_KEY: "  " }),
    (error: unknown) =>
      error instanceof TwelveLabsError &&
      error.code === "TWELVELABS_NOT_CONFIGURED" &&
      error.httpStatus === 503,
  );
});

test("creates a Pegasus index for automatic upload setup", async () => {
  const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  const client = new TwelveLabsClient({
    apiKey: "server-secret",
    baseUrl: TWELVELABS_API_BASE_URL,
    fetch: (async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return jsonResponse({ _id: "index-auto" }, 201);
    }) as typeof fetch,
  });

  const index = await client.createIndex("final-particle-vid03");

  assert.deepEqual(index, { id: "index-auto" });
  assert.equal(calls[0]?.url, `${TWELVELABS_API_BASE_URL}/indexes`);
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    index_name: "final-particle-vid03",
    models: [
      {
        model_name: "pegasus1.2",
        model_options: ["visual", "audio"],
      },
    ],
  });
});

test("direct URL upload and separate indexing preserve the local video id", async () => {
  const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  const responses = [
    jsonResponse(
      {
        _id: "asset-123",
        method: "url",
        status: "processing",
        filename: "source.mp4",
        file_type: "video/mp4",
      },
      201,
    ),
    jsonResponse(
      { _id: "indexed-456", asset_id: "asset-123" },
      202,
    ),
  ];
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = responses.shift();
    assert.ok(response);
    return response;
  }) as typeof fetch;
  const client = new TwelveLabsClient({
    apiKey: "server-secret",
    baseUrl: TWELVELABS_API_BASE_URL,
    fetch: fetchMock,
  });

  const asset = await client.createAssetFromUrl({
    video_id: "vid-03",
    video_url: "https://media.example/source.mp4",
    filename: "source.mp4",
  });
  const indexed = await client.indexAsset({
    video_id: "vid-03",
    index_id: "index-789",
    asset_id: asset.id,
  });

  assert.deepEqual(asset, {
    id: "asset-123",
    video_id: "vid-03",
    status: "processing",
    filename: "source.mp4",
    file_type: "video/mp4",
  });
  assert.deepEqual(indexed, {
    id: "indexed-456",
    asset_id: "asset-123",
    video_id: "vid-03",
    status: "queued",
  });
  assert.equal(calls[0]?.url, `${TWELVELABS_API_BASE_URL}/assets`);
  assert.equal(
    new Headers(calls[0]?.init.headers).get("x-api-key"),
    "server-secret",
  );
  const uploadForm = calls[0]?.init.body;
  assert.ok(uploadForm instanceof FormData);
  assert.equal(uploadForm.get("method"), "url");
  assert.equal(uploadForm.get("url"), "https://media.example/source.mp4");
  assert.equal(
    uploadForm.get("user_metadata"),
    JSON.stringify({ video_id: "vid-03" }),
  );

  assert.equal(
    calls[1]?.url,
    `${TWELVELABS_API_BASE_URL}/indexes/index-789/indexed-assets`,
  );
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), {
    asset_id: "asset-123",
    user_metadata: { video_id: "vid-03" },
  });
});

test("structured analysis sends Pegasus 1.5 the existing prompt and schema", async () => {
  const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  const rawProviderResponse = {
    id: "generation-1",
    data: JSON.stringify({
      gesture_type: "head_nod",
      gesture_region: "face",
      start_ms: 4_900,
      end_ms: 5_300,
      confidence: 0.84,
    }),
    finish_reason: "stop",
    usage: { output_tokens: 42 },
  };
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ url: String(input), init: init ?? {} });
    return jsonResponse(rawProviderResponse);
  }) as typeof fetch;
  const client = new TwelveLabsClient({
    apiKey: "server-secret",
    baseUrl: TWELVELABS_API_BASE_URL,
    fetch: fetchMock,
  });

  const result = await client.analyzeStructured({
    asset_id: "asset-123",
    prompt: "existing Track B prompt",
    response_schema: PEGASUS_GESTURE_RESPONSE_SCHEMA,
    start_ms: 3_000,
    end_ms: 7_200,
  });

  const captured = calls[0];
  assert.ok(captured);
  assert.equal(captured.url, `${TWELVELABS_API_BASE_URL}/analyze`);
  const body = JSON.parse(String(captured.init.body)) as Record<
    string,
    unknown
  >;
  assert.equal(body.model_name, "pegasus1.5");
  assert.deepEqual(body.video, {
    type: "asset_id",
    asset_id: "asset-123",
  });
  assert.deepEqual(body.prompt_v2, {
    input_text: "existing Track B prompt",
  });
  assert.equal(body.stream, false);
  assert.equal(body.start_time, 3);
  assert.equal(body.end_time, 7.2);
  assert.deepEqual(body.response_format, {
    type: "json_schema",
    json_schema: PEGASUS_GESTURE_RESPONSE_SCHEMA,
  });
  assert.deepEqual(result, {
    id: "generation-1",
    data: rawProviderResponse.data,
    finish_reason: "stop",
    raw_response: {
      id: "generation-1",
      data: rawProviderResponse.data,
      finish_reason: "stop",
    },
  });
});

test("successful provider diagnostics cannot expose the server credential", async () => {
  const secret = "sentinel-success-secret";
  const data = JSON.stringify({
    gesture_type: "head_nod",
    gesture_region: "face",
    start_ms: 4_900,
    end_ms: 5_300,
    confidence: 0.84,
  });
  const client = new TwelveLabsClient({
    apiKey: secret,
    baseUrl: TWELVELABS_API_BASE_URL,
    fetch: (async () =>
      jsonResponse({
        id: "generation-safe",
        data,
        finish_reason: "stop",
        diagnostic: `echoed ${secret}`,
      })) as typeof fetch,
  });

  const result = await client.analyzeStructured({
    asset_id: "asset-123",
    prompt: "prompt",
    response_schema: PEGASUS_GESTURE_RESPONSE_SCHEMA,
    start_ms: 3_000,
    end_ms: 7_200,
  });

  assert.deepEqual(result.raw_response, {
    id: "generation-safe",
    data,
    finish_reason: "stop",
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("provider errors never echo an upstream body or credential", async () => {
  const secret = "sentinel-server-secret";
  const upstreamDiagnostic = `bad credential ${secret}`;
  const client = new TwelveLabsClient({
    apiKey: secret,
    baseUrl: TWELVELABS_API_BASE_URL,
    fetch: (async () =>
      jsonResponse({ message: upstreamDiagnostic }, 401)) as typeof fetch,
  });

  await assert.rejects(
    client.retrieveAsset("asset-123"),
    (error: unknown) => {
      assert.ok(error instanceof TwelveLabsError);
      assert.equal(error.code, "TWELVELABS_UNAUTHORIZED");
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.message.includes(upstreamDiagnostic), false);
      return true;
    },
  );
});

test("the request timeout covers a stalled provider response body", async () => {
  const stalledBody = new ReadableStream<Uint8Array>({
    start() {
      // Deliberately never enqueue or close.
    },
  });
  const client = new TwelveLabsClient({
    apiKey: "server-secret",
    baseUrl: TWELVELABS_API_BASE_URL,
    timeoutMs: 5,
    fetch: (async () =>
      new Response(stalledBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  });

  await assert.rejects(
    client.retrieveAsset("asset-123"),
    (error: unknown) =>
      error instanceof TwelveLabsError &&
      error.code === "TWELVELABS_TIMEOUT" &&
      error.retryable,
  );
});

test("retrieved provider identifiers and video metadata must match", async () => {
  const responses = [
    jsonResponse({
      _id: "different-asset",
      status: "ready",
      filename: null,
      file_type: null,
      user_metadata: { video_id: "vid-03" },
    }),
    jsonResponse({
      _id: "different-indexed",
      asset_id: "asset-123",
      status: "ready",
      user_metadata: { video_id: "vid-03" },
    }),
  ];
  const client = new TwelveLabsClient({
    apiKey: "server-secret",
    baseUrl: TWELVELABS_API_BASE_URL,
    fetch: (async () => {
      const response = responses.shift();
      assert.ok(response);
      return response;
    }) as typeof fetch,
  });

  await assert.rejects(
    client.retrieveAsset("asset-123"),
    /mismatched identifier/,
  );
  await assert.rejects(
    client.retrieveIndexedAsset("index-789", "indexed-456"),
    /mismatched identifier/,
  );
});

test("provider analysis windows expand to four seconds without changing units", () => {
  assert.deepEqual(
    createTwelveLabsProviderWindow(
      { start_ms: 0, end_ms: 2_200 },
      10_000,
    ),
    { start_ms: 0, end_ms: 4_000 },
  );
  assert.deepEqual(
    createTwelveLabsProviderWindow(
      { start_ms: 7_800, end_ms: 10_000 },
      10_000,
    ),
    { start_ms: 6_000, end_ms: 10_000 },
  );
  assert.deepEqual(
    createTwelveLabsProviderWindow(
      { start_ms: 3_000, end_ms: 7_200 },
      10_000,
    ),
    { start_ms: 3_000, end_ms: 7_200 },
  );
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
