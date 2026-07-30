import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
} from "../components/integrations/twelvelabs-client.ts";

const analysisWindow = { start_ms: 12_310, end_ms: 16_560 };
const particleInterval = { start_ms: 14_310, end_ms: 14_560 };

test("connection status reads only a configured boolean from the server", async () => {
  const calls: Array<{
    readonly input: string | URL | Request;
    readonly init?: RequestInit;
  }> = [];
  const fetcher = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ input, ...(init === undefined ? {} : { init }) });
    return Response.json({
      data: {
        configured: true,
        api_key: "sentinel-secret-that-must-be-ignored",
      },
    });
  }) as typeof fetch;

  assert.deepEqual(await getTwelveLabsConnectionStatus(fetcher), {
    configured: true,
  });
  assert.equal(String(calls[0]?.input), "/api/integrations/twelvelabs/status");
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(calls[0]?.init?.body, undefined);
});

test("indexing posts only the stable video_id and maps provider states", async () => {
  let capturedBody: unknown;
  const fetcher = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    assert.equal(String(input), "/api/integrations/twelvelabs/index");
    assert.equal(init?.method, "POST");
    capturedBody = JSON.parse(String(init?.body)) as unknown;
    return Response.json({
      data: { video_id: "vid03", status: "ready" },
    });
  }) as typeof fetch;

  assert.deepEqual(await startTwelveLabsIndex(" vid03 ", fetcher), {
    status: "ready",
  });
  assert.deepEqual(capturedBody, { video_id: "vid03" });
  assert.equal(JSON.stringify(capturedBody).includes("api_key"), false);
  assert.equal(JSON.stringify(capturedBody).includes("secret"), false);
});

test("analysis posts an absolute-ms window and parses a Pegasus suggestion", async () => {
  let capturedBody: unknown;
  const fetcher = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    assert.equal(String(input), "/api/integrations/twelvelabs/analyze");
    assert.equal(init?.method, "POST");
    capturedBody = JSON.parse(String(init?.body)) as unknown;
    return Response.json({
      data: {
        video_id: "vid03",
        gesture_type: "head_nod",
        gesture_region: "face",
        start_ms: 13_800,
        end_ms: 14_800,
        confidence: 0.81,
        source: "pegasus",
      },
    });
  }) as typeof fetch;

  assert.deepEqual(
    await analyzeTwelveLabsGesture(
      { video_id: "vid03", analysis_window: analysisWindow },
      fetcher,
    ),
    {
      gesture_type: "head_nod",
      gesture_region: "face",
      start_ms: 13_800,
      end_ms: 14_800,
      confidence: 0.81,
      provenance: "Pegasus",
    },
  );
  assert.deepEqual(capturedBody, {
    video_id: "vid03",
    analysis_window: analysisWindow,
  });
  assert.equal(JSON.stringify(capturedBody).includes("api_key"), false);
});

test("analysis accepts the existing Track B annotation envelope", () => {
  assert.deepEqual(
    parseGestureSuggestionPayload(
      {
        data: {
          video_id: "vid03",
          annotation: {
            video_id: "vid03",
            gesture_type: {
              value: "eyebrow_raise",
              confidence: 0.82,
              source: "pegasus",
              confirmed: false,
            },
            gesture_region: {
              value: "face",
              confidence: 0.82,
              source: "pegasus",
              confirmed: false,
            },
            gesture_boundaries: {
              value: { start_ms: 13_720, end_ms: 14_610 },
              confidence: 0.82,
              source: "pegasus",
              confirmed: false,
            },
          },
        },
      },
      "vid03",
      analysisWindow,
    ),
    {
      gesture_type: "eyebrow_raise",
      gesture_region: "face",
      start_ms: 13_720,
      end_ms: 14_610,
      confidence: 0.82,
      provenance: "Pegasus",
    },
  );
});

test("analysis rejects cross-video and window-relative results", () => {
  assert.throws(
    () =>
      parseGestureSuggestionPayload(
        {
          data: {
            video_id: "vid04",
            gesture_type: "head_nod",
            gesture_region: "face",
            start_ms: 13_800,
            end_ms: 14_800,
            confidence: 0.81,
          },
        },
        "vid03",
        analysisWindow,
      ),
    /different video/,
  );

  assert.throws(
    () =>
      parseGestureSuggestionPayload(
        {
          data: {
            video_id: "vid03",
            gesture_type: "head_nod",
            gesture_region: "face",
            start_ms: 0,
            end_ms: 900,
            confidence: 0.81,
          },
        },
        "vid03",
        analysisWindow,
      ),
    /invalid gesture analysis response/,
  );
});

test("the success view labels every result as an unreviewed AI suggestion", () => {
  const markup = renderView({
    connectionState: { status: "configured" },
    indexState: { status: "ready" },
    analysisState: {
      status: "ready",
      suggestion: {
        gesture_type: "head_nod",
        gesture_region: "face",
        start_ms: 13_800,
        end_ms: 14_800,
        confidence: 0.81,
        provenance: "Pegasus",
      },
    },
  });

  assert.match(markup, /AI suggestion — human review required\./);
  assert.match(markup, /Gesture type/);
  assert.match(markup, /Head nod/);
  assert.match(markup, /Region/);
  assert.match(markup, /13,800 ms/);
  assert.match(markup, /14,800 ms/);
  assert.match(markup, /81%/);
  assert.match(markup, /Provenance/);
  assert.match(markup, /Pegasus/);
  assert.match(markup, /TWELVELABS_API_KEY/);
  assert.doesNotMatch(markup, /type="password"/);
  assert.doesNotMatch(markup, /name="api_key"/);
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
  assert.match(loadingMarkup, /disabled=""/);

  const emptyMarkup = renderView({
    connectionState: { status: "unconfigured" },
    indexState: { status: "idle" },
    analysisState: { status: "idle" },
  });
  assert.match(emptyMarkup, /Not configured/);
  assert.match(emptyMarkup, /server environment/);
  assert.match(emptyMarkup, /No indexing request started/);
  assert.match(emptyMarkup, /No gesture suggestion yet/);

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

test("analysis window validation keeps particle timing on one source timeline", () => {
  assert.equal(
    windowValidationMessage({
      window_start_ms: 12_310,
      window_end_ms: 16_560,
      particle_start_ms: 14_310,
      particle_end_ms: 14_560,
    }),
    null,
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
    videoOptions: [
      {
        video_id: "vid03",
        instance_id: "vid03:u17",
        analysis_window: analysisWindow,
        particle_interval: particleInterval,
      },
    ],
    videoId: "vid03",
    windowDraft: {
      window_start_ms: analysisWindow.start_ms,
      window_end_ms: analysisWindow.end_ms,
      particle_start_ms: particleInterval.start_ms,
      particle_end_ms: particleInterval.end_ms,
    },
    ...states,
    onVideoIdChange() {},
    onWindowValueChange() {},
    onCheckConnection() {},
    onStartIndexing() {},
    onAnalyze() {},
  } satisfies TwelveLabsIntegrationViewProps;
  return renderToStaticMarkup(
    createElement(TwelveLabsIntegrationView, props),
  );
}
