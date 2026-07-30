import assert from "node:assert/strict";
import test from "node:test";

import { POST as analyze } from "../app/api/integrations/twelvelabs/analyze/route.ts";
import { POST as indexVideo } from "../app/api/integrations/twelvelabs/index/route.ts";
import { GET as getStatus } from "../app/api/integrations/twelvelabs/status/route.ts";

const trackAParticle = {
  instance_id: "vid-03:u1",
  fp_token: "吗",
  fp_pinyin: "ma",
  surface_form: "嗎",
  fp_start_ms: 5_000,
  fp_end_ms: 5_200,
  utterance_id: "u1",
  source: "mfa_rule",
  confidence: null,
  confirmed: false,
} as const;

test("status reports configuration without returning the server key", async (t) => {
  const restoreEnvironment = setApiKey("status-sentinel-secret");
  t.after(restoreEnvironment);

  const response = getStatus();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.data.configured, true);
  assert.equal(JSON.stringify(body).includes("status-sentinel-secret"), false);
  assert.equal("api_key" in body.data, false);
});

test("status remains a safe 200 when the provider is not configured", async (t) => {
  const restoreEnvironment = setApiKey(undefined);
  t.after(restoreEnvironment);

  const response = getStatus();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.configured, false);
});

test("index upload preserves local and provider identities", async (t) => {
  const restoreEnvironment = setApiKey("server-secret");
  const restoreFetch = setFetch(async () =>
    jsonResponse(
      {
        _id: "asset-123",
        status: "processing",
        filename: "source.mp4",
        file_type: "video/mp4",
      },
      201,
    ),
  );
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const response = await indexVideo(
    jsonRequest("/api/integrations/twelvelabs/index", {
      action: "upload",
      video_id: "vid-03",
      index_id: "index-789",
      video_url: "https://media.example/source.mp4",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.deepEqual(body.data, {
    provider: "twelvelabs",
    video_id: "vid-03",
    index_id: "index-789",
    asset_id: "asset-123",
    indexed_asset_id: null,
    stage: "upload",
    status: "processing",
  });
});

test("index action waits for a ready asset and starts separate indexing", async (t) => {
  const restoreEnvironment = setApiKey("server-secret");
  const calls: string[] = [];
  const responses = [
    jsonResponse({
      _id: "asset-123",
      status: "ready",
      filename: "source.mp4",
      file_type: "video/mp4",
    }),
    jsonResponse(
      { _id: "indexed-456", asset_id: "asset-123" },
      202,
    ),
  ];
  const restoreFetch = setFetch(async (input) => {
    calls.push(String(input));
    const response = responses.shift();
    assert.ok(response);
    return response;
  });
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const response = await indexVideo(
    jsonRequest("/api/integrations/twelvelabs/index", {
      action: "index",
      video_id: "vid-03",
      index_id: "index-789",
      asset_id: "asset-123",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.deepEqual(body.data, {
    provider: "twelvelabs",
    video_id: "vid-03",
    index_id: "index-789",
    asset_id: "asset-123",
    indexed_asset_id: "indexed-456",
    stage: "index",
    status: "processing",
  });
  assert.match(calls[0] ?? "", /\/assets\/asset-123$/);
  assert.match(
    calls[1] ?? "",
    /\/indexes\/index-789\/indexed-assets$/,
  );
});

test("multipart upload accepts a local video without exposing credentials", async (t) => {
  const secret = "multipart-sentinel-secret";
  const restoreEnvironment = setApiKey(secret);
  const upstreamHeaders: Headers[] = [];
  const restoreFetch = setFetch(async (_input, init) => {
    upstreamHeaders.push(new Headers(init?.headers));
    return jsonResponse(
      {
        _id: "asset-file",
        status: "processing",
        filename: "clip.mp4",
        file_type: "video/mp4",
      },
      201,
    );
  });
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const form = new FormData();
  form.set("video_id", "vid-03");
  form.set("index_id", "index-789");
  form.set(
    "video_file",
    new File([new Uint8Array([0, 1, 2])], "clip.mp4", {
      type: "video/mp4",
    }),
  );
  const response = await indexVideo(
    new Request("http://localhost/api/integrations/twelvelabs/index", {
      method: "POST",
      body: form,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.data.video_id, "vid-03");
  assert.equal(body.data.asset_id, "asset-file");
  assert.equal(JSON.stringify(body).includes(secret), false);
  assert.equal(upstreamHeaders[0]?.get("x-api-key"), secret);
});

test("analyze returns an unconfirmed draft with raw Pegasus provenance", async (t) => {
  const restoreEnvironment = setApiKey("server-secret");
  const providerRequests: Record<string, unknown>[] = [];
  const rawResponse = {
    id: "generation-1",
    data: JSON.stringify({
      gesture_type: "eyebrow_raise",
      gesture_region: "face",
      start_ms: 4_850,
      end_ms: 5_300,
      confidence: 0.82,
    }),
    finish_reason: "stop",
    usage: { output_tokens: 35 },
  };
  const restoreFetch = setFetch(async (_input, init) => {
    providerRequests.push(
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    return jsonResponse(rawResponse);
  });
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const response = await analyze(
    jsonRequest("/api/integrations/twelvelabs/analyze", {
      video_id: "vid-03",
      instance_id: "vid-03:u1",
      asset_id: "asset-123",
      video_duration_ms: 12_000,
      particle: trackAParticle,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.video_id, "vid-03");
  assert.equal(body.data.instance_id, "vid-03:u1");
  assert.equal(body.data.asset_id, "asset-123");
  assert.deepEqual(body.data.annotation.analysis_window, {
    start_ms: 3_000,
    end_ms: 7_200,
  });
  assert.deepEqual(body.data.annotation.gesture_present, {
    value: true,
    confidence: 0.82,
    source: "pegasus",
    confirmed: false,
  });
  assert.equal(body.data.annotation.gesture_type.confirmed, false);
  assert.equal(body.data.annotation.gesture_region.confirmed, false);
  assert.equal(body.data.annotation.gesture_boundaries.confirmed, false);
  assert.deepEqual(body.data.annotation.model_evidence.provider, {
    provider: "twelvelabs",
    model: "pegasus1.5",
    asset_id: "asset-123",
    provider_window: { start_ms: 3_000, end_ms: 7_200 },
    response_id: "generation-1",
    finish_reason: "stop",
    raw_response: rawResponse,
  });

  const providerRequest = providerRequests[0];
  assert.ok(providerRequest);
  assert.equal(providerRequest.model_name, "pegasus1.5");
  assert.equal(providerRequest.start_time, 3);
  assert.equal(providerRequest.end_time, 7.2);
  const promptV2 = providerRequest.prompt_v2 as
    | Record<string, unknown>
    | undefined;
  assert.match(String(promptV2?.input_text), /vid-03:u1|utterance u1/);
  const responseFormat = providerRequest.response_format as
    | Record<string, unknown>
    | undefined;
  assert.equal(responseFormat?.type, "json_schema");
});

test("no-gesture analysis stays an explicit unconfirmed suggestion", async (t) => {
  const restoreEnvironment = setApiKey("server-secret");
  const restoreFetch = setFetch(async () =>
    jsonResponse({
      id: "generation-none",
      data: JSON.stringify({
        gesture_type: "none",
        gesture_region: null,
        start_ms: null,
        end_ms: null,
        confidence: 0.63,
      }),
      finish_reason: "stop",
    }),
  );
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const response = await analyze(
    jsonRequest("/api/integrations/twelvelabs/analyze", {
      video_id: "vid-03",
      asset_id: "asset-123",
      video_duration_ms: 12_000,
      particle: trackAParticle,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data.annotation.gesture_present, {
    value: false,
    confidence: 0.63,
    source: "pegasus",
    confirmed: false,
  });
  assert.equal(body.data.annotation.gesture_region.value, null);
  assert.equal(body.data.annotation.gesture_boundaries.value, null);
  assert.equal(body.data.annotation.gesture_boundaries.confirmed, false);
});

test("invalid cross-video input is rejected before TwelveLabs is called", async (t) => {
  const restoreEnvironment = setApiKey("server-secret");
  let providerCalls = 0;
  const restoreFetch = setFetch(async () => {
    providerCalls += 1;
    return jsonResponse({});
  });
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const response = await analyze(
    jsonRequest("/api/integrations/twelvelabs/analyze", {
      video_id: "vid-other",
      asset_id: "asset-123",
      video_duration_ms: 12_000,
      particle: trackAParticle,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(providerCalls, 0);
});

test("malformed structured output becomes a safe provider error", async (t) => {
  const restoreEnvironment = setApiKey("server-secret");
  const secretDiagnostic = "provider-secret-diagnostic";
  const restoreFetch = setFetch(async () =>
    jsonResponse({
      id: "generation-1",
      data: JSON.stringify({
        gesture_type: "not-controlled",
        diagnostic: secretDiagnostic,
      }),
      finish_reason: "stop",
    }),
  );
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const response = await analyze(
    jsonRequest("/api/integrations/twelvelabs/analyze", {
      video_id: "vid-03",
      asset_id: "asset-123",
      video_duration_ms: 12_000,
      particle: trackAParticle,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error.code, "TWELVELABS_INVALID_RESPONSE");
  assert.equal(JSON.stringify(body).includes(secretDiagnostic), false);
});

function setApiKey(value: string | undefined): () => void {
  const previous = process.env.TWELVELABS_API_KEY;
  if (value === undefined) {
    delete process.env.TWELVELABS_API_KEY;
  } else {
    process.env.TWELVELABS_API_KEY = value;
  }
  return () => {
    if (previous === undefined) {
      delete process.env.TWELVELABS_API_KEY;
    } else {
      process.env.TWELVELABS_API_KEY = previous;
    }
  };
}

function setFetch(
  implementation: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = implementation as typeof fetch;
  return () => {
    globalThis.fetch = previous;
  };
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
