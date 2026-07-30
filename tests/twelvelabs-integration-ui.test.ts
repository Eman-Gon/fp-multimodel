import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { POST as analyzeRoute } from "../app/api/integrations/twelvelabs/analyze/route.ts";
import { POST as indexRoute } from "../app/api/integrations/twelvelabs/index/route.ts";
import { GET as statusRoute } from "../app/api/integrations/twelvelabs/status/route.ts";
import {
  TwelveLabsIntegrationView,
  type TwelveLabsIntegrationViewProps,
  windowValidationMessage,
} from "../components/integrations/twelvelabs-integration.tsx";
import {
  analyzeTwelveLabsGesture,
  getTwelveLabsConnectionStatus,
  parseGestureSuggestionPayload,
  startTwelveLabsIndex,
  type TwelveLabsGestureSuggestion,
} from "../components/integrations/twelvelabs-client.ts";
import type { TwelveLabsAnalyzeRequest } from "../lib/twelvelabs/contracts.ts";
import type { GestureAnnotationDraft } from "../lib/types.ts";

const analysisWindow = { start_ms: 12_310, end_ms: 16_560 };
const particleInterval = { start_ms: 14_310, end_ms: 14_560 };
const trackAParticle = {
  instance_id: "vid03:u17",
  fp_token: "吗",
  fp_pinyin: "ma",
  surface_form: "嗎",
  fp_start_ms: particleInterval.start_ms,
  fp_end_ms: particleInterval.end_ms,
  utterance_id: "u17",
  source: "mfa_rule",
  confidence: 0.82,
  confirmed: false,
} as const;
const analyzeRequest = {
  video_id: "vid03",
  instance_id: "vid03:u17",
  asset_id: "asset-123",
  video_duration_ms: 183_000,
  particle: trackAParticle,
} satisfies TwelveLabsAnalyzeRequest;

test("browser status parsing uses the shared safe server contract", async (t) => {
  const restoreEnvironment = setApiKey("status-ui-secret");
  t.after(restoreEnvironment);

  const result = await getTwelveLabsConnectionStatus(routeFetcher);

  assert.equal(result.provider, "twelvelabs");
  assert.equal(result.configured, true);
  assert.equal(result.api_version, "v1.3");
  assert.equal(result.model, "pegasus1.5");
  assert.equal(JSON.stringify(result).includes("status-ui-secret"), false);
});

test("browser indexing completes the real upload, polling, and index route sequence", async (t) => {
  const secret = "index-ui-secret";
  const restoreEnvironment = setApiKey(secret);
  const providerResponses = [
    assetResponse("ready"),
    assetResponse("ready"),
    jsonResponse({
      _id: "indexed-456",
      asset_id: "asset-123",
      user_metadata: { video_id: "vid03" },
    }),
    jsonResponse({
      _id: "indexed-456",
      asset_id: "asset-123",
      status: "ready",
      user_metadata: { video_id: "vid03" },
    }),
  ];
  const providerCalls: string[] = [];
  const restoreFetch = setFetch(async (input) => {
    providerCalls.push(String(input));
    const response = providerResponses.shift();
    assert.ok(response);
    return response;
  });
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const result = await startTwelveLabsIndex(
    {
      video_id: "vid03",
      index_id: "index-789",
      video_url: "https://media.example/source.mp4",
    },
    routeFetcher,
    { poll_interval_ms: 0, max_poll_attempts: 3 },
  );

  assert.deepEqual(result, {
    provider: "twelvelabs",
    video_id: "vid03",
    index_id: "index-789",
    asset_id: "asset-123",
    indexed_asset_id: "indexed-456",
    stage: "index",
    status: "ready",
  });
  assert.equal(providerResponses.length, 0);
  assert.match(providerCalls[0] ?? "", /\/assets$/);
  assert.match(providerCalls[1] ?? "", /\/assets\/asset-123$/);
  assert.match(
    providerCalls[2] ?? "",
    /\/indexes\/index-789\/indexed-assets$/,
  );
  assert.match(
    providerCalls[3] ?? "",
    /\/indexes\/index-789\/indexed-assets\/indexed-456$/,
  );
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("browser analysis reaches the real route and retains identity, draft state, and provenance", async (t) => {
  const secret = "analysis-ui-secret";
  const restoreEnvironment = setApiKey(secret);
  const providerOutput = {
    gesture_type: "head_nod",
    gesture_region: "face",
    start_ms: 13_800,
    end_ms: 14_800,
    confidence: 0.81,
  };
  const providerResponses = [
    assetResponse("ready"),
    jsonResponse({
      id: "generation-1",
      data: JSON.stringify(providerOutput),
      finish_reason: "stop",
      diagnostic: `must not reach the browser: ${secret}`,
    }),
  ];
  const restoreFetch = setFetch(async () => {
    const response = providerResponses.shift();
    assert.ok(response);
    return response;
  });
  t.after(() => {
    restoreFetch();
    restoreEnvironment();
  });

  const suggestion = await analyzeTwelveLabsGesture(
    analyzeRequest,
    routeFetcher,
  );

  assert.equal(suggestion.video_id, "vid03");
  assert.equal(suggestion.instance_id, "vid03:u17");
  assert.equal(suggestion.annotation.video_id, "vid03");
  assert.equal(suggestion.annotation.instance_id, "vid03:u17");
  assert.equal(suggestion.confirmed, false);
  assert.equal(suggestion.annotation.gesture_present.confirmed, false);
  assert.equal(suggestion.annotation.gesture_type.confirmed, false);
  assert.equal(suggestion.annotation.gesture_region.confirmed, false);
  assert.equal(suggestion.annotation.gesture_boundaries.confirmed, false);
  assert.deepEqual(suggestion.annotation.model_evidence.pegasus, {
    gesture_type: providerOutput.gesture_type,
    gesture_region: providerOutput.gesture_region,
    segment: {
      start_ms: providerOutput.start_ms,
      end_ms: providerOutput.end_ms,
    },
    confidence: providerOutput.confidence,
  });
  assert.equal(suggestion.provenance.provider, "twelvelabs");
  assert.equal(suggestion.provenance.model, "pegasus1.5");
  assert.equal(suggestion.provenance.asset_id, "asset-123");
  assert.deepEqual(suggestion.provenance.provider_window, analysisWindow);
  assert.equal(
    JSON.stringify(suggestion).includes(secret),
    false,
  );
  assertCanonicalMilliseconds(suggestion);
});

test("the result view keeps IDs, provenance, and human-review labeling visible", () => {
  const markup = renderView({
    connectionState: { status: "configured" },
    indexState: {
      status: "ready",
      result: readyIndexResult(),
    },
    analysisState: {
      status: "ready",
      suggestion: suggestionFixture(),
    },
  });

  assert.match(markup, /AI suggestion — human review required\./);
  assert.match(markup, /Head nod/);
  assert.match(markup, /13,800 ms/);
  assert.match(markup, /14,800 ms/);
  assert.match(markup, /81%/);
  assert.match(markup, /twelvelabs pegasus1\.5/i);
  assert.match(markup, /vid03:u17/);
  assert.match(markup, /Unconfirmed/);
  assert.match(markup, /TWELVELABS_API_KEY/);
  assert.doesNotMatch(markup, /type="password"/);
  assert.doesNotMatch(markup, /name="api_key"/);
  assert.match(markup, /readOnly=""/);
  assert.match(markup, /retained Track A timing is read-only/i);
});

test("browser parsing rejects malformed nested model evidence", () => {
  const annotation = suggestionFixture().annotation;
  const fractionalMotionPayload = {
    data: {
      provider: "twelvelabs",
      model: "pegasus1.5",
      video_id: "vid03",
      instance_id: "vid03:u17",
      asset_id: "asset-123",
      annotation: {
        ...annotation,
        model_evidence: {
          ...annotation.model_evidence,
          mediapipe_intervals: [
            { start_ms: 13_800.5, end_ms: 14_800 },
          ],
        },
      },
    },
  };
  assert.throws(
    () =>
      parseGestureSuggestionPayload(
        fractionalMotionPayload,
        analyzeRequest,
      ),
    /invalid gesture annotation response/,
  );

  const missingPegasusSegmentPayload = {
    data: {
      ...fractionalMotionPayload.data,
      annotation: {
        ...annotation,
        model_evidence: {
          ...annotation.model_evidence,
          pegasus: {
            ...annotation.model_evidence.pegasus,
            segment: null,
          },
        },
      },
    },
  };
  assert.throws(
    () =>
      parseGestureSuggestionPayload(
        missingPegasusSegmentPayload,
        analyzeRequest,
      ),
    /invalid Pegasus evidence response/,
  );

  const emptyRawProvenancePayload = {
    data: {
      ...fractionalMotionPayload.data,
      annotation: {
        ...annotation,
        model_evidence: {
          ...annotation.model_evidence,
          provider: {
            ...annotation.model_evidence.provider,
            raw_response: {},
          },
        },
      },
    },
  };
  assert.throws(
    () =>
      parseGestureSuggestionPayload(
        emptyRawProvenancePayload,
        analyzeRequest,
      ),
    /invalid gesture provenance response/,
  );
});

test("loading, empty, and failed states expose accessible status semantics", () => {
  const loadingMarkup = renderView({
    connectionState: { status: "loading" },
    indexState: { status: "processing" },
    analysisState: { status: "processing" },
  });
  assert.match(loadingMarkup, /aria-busy="true"/);
  assert.match(loadingMarkup, /role="status"/);
  assert.match(loadingMarkup, /Indexing…/);
  assert.match(loadingMarkup, /Analyzing…/);

  const emptyMarkup = renderView({
    connectionState: { status: "unconfigured" },
    indexState: { status: "idle" },
    analysisState: { status: "idle" },
  });
  assert.match(emptyMarkup, /Not configured/);
  assert.match(emptyMarkup, /server environment/);
  assert.match(emptyMarkup, /No indexing request started/);

  const failedMarkup = renderView({
    connectionState: { status: "error", message: "Status failed." },
    indexState: { status: "failed", message: "Index failed." },
    analysisState: { status: "failed", message: "Analysis failed." },
  });
  assert.match(failedMarkup, /role="alert"/);
  assert.match(failedMarkup, /Status failed\./);
  assert.match(failedMarkup, /Index failed\./);
  assert.match(failedMarkup, /Analysis failed\./);
});

test("analysis window validation enforces integer source-video bounds", () => {
  assert.equal(
    windowValidationMessage(
      {
        window_start_ms: 12_310,
        window_end_ms: 16_560,
        particle_start_ms: 14_310,
        particle_end_ms: 14_560,
      },
      183_000,
    ),
    null,
  );
  assert.match(
    windowValidationMessage(
      {
        window_start_ms: 12_310,
        window_end_ms: 200_000,
        particle_start_ms: 14_310,
        particle_end_ms: 14_560,
      },
      183_000,
    ) ?? "",
    /inside the source video/,
  );
  assert.match(
    windowValidationMessage({
      window_start_ms: 12_310,
      window_end_ms: 16_560,
      particle_start_ms: 10,
      particle_end_ms: 20,
    }) ?? "",
    /inside the analysis window/,
  );
});

function renderView(
  states: Pick<
    TwelveLabsIntegrationViewProps,
    "connectionState" | "indexState" | "analysisState"
  >,
): string {
  const props = {
    videoOptions: [videoOption()],
    videoId: "vid03",
    instanceId: "vid03:u17",
    indexId: "index-789",
    videoUrl: "https://media.example/source.mp4",
    windowDraft: {
      window_start_ms: analysisWindow.start_ms,
      window_end_ms: analysisWindow.end_ms,
      particle_start_ms: particleInterval.start_ms,
      particle_end_ms: particleInterval.end_ms,
    },
    ...states,
    onVideoIdChange() {},
    onInstanceIdChange() {},
    onIndexIdChange() {},
    onVideoUrlChange() {},
    onWindowValueChange() {},
    onCheckConnection() {},
    onStartIndexing() {},
    onAnalyze() {},
  } satisfies TwelveLabsIntegrationViewProps;
  return renderToStaticMarkup(
    createElement(TwelveLabsIntegrationView, props),
  );
}

function videoOption() {
  return {
    video_id: "vid03",
    instance_id: "vid03:u17",
    video_duration_ms: 183_000,
    source_url: "https://media.example/source.mp4",
    analysis_window: analysisWindow,
    particle_interval: particleInterval,
    particle: trackAParticle,
  } as const;
}

function readyIndexResult() {
  return {
    provider: "twelvelabs",
    video_id: "vid03",
    index_id: "index-789",
    asset_id: "asset-123",
    indexed_asset_id: "indexed-456",
    stage: "index",
    status: "ready",
  } as const;
}

function suggestionFixture(): TwelveLabsGestureSuggestion {
  const pegasus = {
    gesture_type: "head_nod",
    gesture_region: "face",
    segment: { start_ms: 13_800, end_ms: 14_800 },
    confidence: 0.81,
  } as const;
  const provider = {
    provider: "twelvelabs",
    model: "pegasus1.5",
    asset_id: "asset-123",
    provider_window: analysisWindow,
    response_id: "generation-1",
    finish_reason: "stop",
    raw_response: {
      id: "generation-1",
      data: JSON.stringify({
        gesture_type: "head_nod",
        gesture_region: "face",
        start_ms: 13_800,
        end_ms: 14_800,
        confidence: 0.81,
      }),
      finish_reason: "stop",
    },
  } as const;
  const annotation = {
    video_id: "vid03",
    instance_id: "vid03:u17",
    analysis_window: analysisWindow,
    gesture_present: {
      value: true,
      confidence: 0.81,
      source: "pegasus",
      confirmed: false,
    },
    gesture_type: {
      value: "head_nod",
      confidence: 0.81,
      source: "pegasus",
      confirmed: false,
    },
    gesture_region: {
      value: "face",
      confidence: 0.81,
      source: "pegasus",
      confirmed: false,
    },
    gesture_boundaries: {
      value: { start_ms: 13_800, end_ms: 14_800 },
      confidence: 0.81,
      source: "pegasus",
      confirmed: false,
    },
    model_evidence: {
      pegasus,
      mediapipe_intervals: [],
      provider,
    },
  } satisfies GestureAnnotationDraft;
  return {
    video_id: "vid03",
    instance_id: "vid03:u17",
    asset_id: "asset-123",
    gesture_type: "head_nod",
    gesture_region: "face",
    start_ms: 13_800,
    end_ms: 14_800,
    confidence: 0.81,
    confirmed: false,
    provenance: provider,
    annotation,
  };
}

async function routeFetcher(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const request =
    input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith("/status")) {
    return statusRoute();
  }
  if (pathname.endsWith("/index")) {
    return indexRoute(request);
  }
  if (pathname.endsWith("/analyze")) {
    return analyzeRoute(request);
  }
  throw new Error(`Unexpected route: ${pathname}`);
}

function assetResponse(status: "processing" | "ready" | "failed"): Response {
  return jsonResponse({
    _id: "asset-123",
    status,
    filename: "source.mp4",
    file_type: "video/mp4",
    user_metadata: { video_id: "vid03" },
  });
}

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

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assertCanonicalMilliseconds(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertCanonicalMilliseconds);
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, field] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (key.endsWith("_ms")) {
      assert.equal(
        Number.isSafeInteger(field) && (field as number) >= 0,
        true,
        `${key} must be a non-negative safe integer`,
      );
    }
    assertCanonicalMilliseconds(field);
  }
}
