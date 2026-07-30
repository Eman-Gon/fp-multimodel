"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  CircleDashed,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Video,
} from "lucide-react";
import type { TimeRange } from "@/lib/types.ts";
import { humanizeCode } from "@/lib/track-c/display.ts";
import {
  analyzeTwelveLabsGesture,
  getTwelveLabsConnectionStatus,
  startTwelveLabsIndex,
  TwelveLabsUiRequestError,
  type TwelveLabsGestureSuggestion,
} from "./twelvelabs-client.ts";

export interface TwelveLabsVideoOption {
  readonly video_id: string;
  readonly instance_id: string;
  readonly analysis_window: TimeRange;
  readonly particle_interval: TimeRange;
}

export interface AnalysisWindowDraft {
  readonly window_start_ms: number | null;
  readonly window_end_ms: number | null;
  readonly particle_start_ms: number | null;
  readonly particle_end_ms: number | null;
}

export type ConnectionViewState =
  | { readonly status: "loading" }
  | { readonly status: "configured" }
  | { readonly status: "unconfigured" }
  | { readonly status: "error"; readonly message: string };

export type IndexViewState =
  | { readonly status: "idle" }
  | { readonly status: "processing" }
  | { readonly status: "ready" }
  | { readonly status: "failed"; readonly message: string };

export type AnalysisViewState =
  | { readonly status: "idle" }
  | { readonly status: "processing" }
  | {
      readonly status: "ready";
      readonly suggestion: TwelveLabsGestureSuggestion;
    }
  | { readonly status: "failed"; readonly message: string };

interface TwelveLabsIntegrationProps {
  readonly videoOptions: readonly TwelveLabsVideoOption[];
}

export interface TwelveLabsIntegrationViewProps {
  readonly videoOptions: readonly TwelveLabsVideoOption[];
  readonly videoId: string;
  readonly windowDraft: AnalysisWindowDraft;
  readonly connectionState: ConnectionViewState;
  readonly indexState: IndexViewState;
  readonly analysisState: AnalysisViewState;
  readonly onVideoIdChange: (videoId: string) => void;
  readonly onWindowValueChange: (
    field: keyof AnalysisWindowDraft,
    value: number | null,
  ) => void;
  readonly onCheckConnection: () => void;
  readonly onStartIndexing: () => void;
  readonly onAnalyze: () => void;
}

const EMPTY_WINDOW_DRAFT: AnalysisWindowDraft = {
  window_start_ms: null,
  window_end_ms: null,
  particle_start_ms: null,
  particle_end_ms: null,
};

export function TwelveLabsIntegration({
  videoOptions,
}: TwelveLabsIntegrationProps) {
  const initialOption = videoOptions[0];
  const [videoId, setVideoId] = useState(initialOption?.video_id ?? "");
  const [windowDraft, setWindowDraft] = useState<AnalysisWindowDraft>(
    initialOption === undefined
      ? EMPTY_WINDOW_DRAFT
      : draftFromOption(initialOption),
  );
  const [connectionState, setConnectionState] =
    useState<ConnectionViewState>({ status: "loading" });
  const [indexState, setIndexState] = useState<IndexViewState>({
    status: "idle",
  });
  const [analysisState, setAnalysisState] = useState<AnalysisViewState>({
    status: "idle",
  });
  const connectionRequest = useRef(0);
  const indexRequest = useRef(0);
  const analysisRequest = useRef(0);

  const checkConnection = useCallback(async () => {
    const requestId = ++connectionRequest.current;
    setConnectionState({ status: "loading" });
    try {
      const result = await getTwelveLabsConnectionStatus();
      if (requestId !== connectionRequest.current) {
        return;
      }
      setConnectionState({
        status: result.configured ? "configured" : "unconfigured",
      });
    } catch (error) {
      if (requestId !== connectionRequest.current) {
        return;
      }
      setConnectionState({
        status: "error",
        message: requestErrorMessage(
          error,
          "Connection status could not be loaded.",
        ),
      });
    }
  }, []);

  useEffect(() => {
    void checkConnection();
    return () => {
      connectionRequest.current += 1;
      indexRequest.current += 1;
      analysisRequest.current += 1;
    };
  }, [checkConnection]);

  const resetOperations = () => {
    indexRequest.current += 1;
    analysisRequest.current += 1;
    setIndexState({ status: "idle" });
    setAnalysisState({ status: "idle" });
  };

  const handleVideoIdChange = (nextVideoId: string) => {
    setVideoId(nextVideoId);
    const knownVideo = videoOptions.find(
      ({ video_id: optionVideoId }) => optionVideoId === nextVideoId.trim(),
    );
    setWindowDraft(
      knownVideo === undefined
        ? EMPTY_WINDOW_DRAFT
        : draftFromOption(knownVideo),
    );
    resetOperations();
  };

  const handleWindowValueChange = (
    field: keyof AnalysisWindowDraft,
    value: number | null,
  ) => {
    analysisRequest.current += 1;
    setWindowDraft((current) => ({ ...current, [field]: value }));
    setAnalysisState({ status: "idle" });
  };

  const handleStartIndexing = async () => {
    if (
      connectionState.status !== "configured" ||
      videoId.trim().length === 0 ||
      indexState.status === "processing"
    ) {
      return;
    }

    const requestId = ++indexRequest.current;
    analysisRequest.current += 1;
    setIndexState({ status: "processing" });
    setAnalysisState({ status: "idle" });

    try {
      const result = await startTwelveLabsIndex(videoId);
      if (requestId !== indexRequest.current) {
        return;
      }
      setIndexState(
        result.status === "failed"
          ? {
              status: "failed",
              message: "TwelveLabs reported that indexing failed.",
            }
          : { status: result.status },
      );
    } catch (error) {
      if (requestId !== indexRequest.current) {
        return;
      }
      setIndexState({
        status: "failed",
        message: requestErrorMessage(
          error,
          "The indexing request could not be completed.",
        ),
      });
    }
  };

  const handleAnalyze = async () => {
    const validWindow = validWindowContext(windowDraft);
    if (
      connectionState.status !== "configured" ||
      indexState.status !== "ready" ||
      validWindow === null ||
      analysisState.status === "processing"
    ) {
      return;
    }

    const requestId = ++analysisRequest.current;
    setAnalysisState({ status: "processing" });
    try {
      const suggestion = await analyzeTwelveLabsGesture({
        video_id: videoId,
        analysis_window: validWindow.analysis_window,
      });
      if (requestId !== analysisRequest.current) {
        return;
      }
      setAnalysisState({ status: "ready", suggestion });
    } catch (error) {
      if (requestId !== analysisRequest.current) {
        return;
      }
      setAnalysisState({
        status: "failed",
        message: requestErrorMessage(
          error,
          "The gesture analysis request could not be completed.",
        ),
      });
    }
  };

  return (
    <TwelveLabsIntegrationView
      videoOptions={videoOptions}
      videoId={videoId}
      windowDraft={windowDraft}
      connectionState={connectionState}
      indexState={indexState}
      analysisState={analysisState}
      onVideoIdChange={handleVideoIdChange}
      onWindowValueChange={handleWindowValueChange}
      onCheckConnection={() => void checkConnection()}
      onStartIndexing={() => void handleStartIndexing()}
      onAnalyze={() => void handleAnalyze()}
    />
  );
}

export function TwelveLabsIntegrationView({
  videoOptions,
  videoId,
  windowDraft,
  connectionState,
  indexState,
  analysisState,
  onVideoIdChange,
  onWindowValueChange,
  onCheckConnection,
  onStartIndexing,
  onAnalyze,
}: TwelveLabsIntegrationViewProps) {
  const windowError = windowValidationMessage(windowDraft);
  const validWindow = validWindowContext(windowDraft);
  const canIndex =
    connectionState.status === "configured" &&
    videoId.trim().length > 0 &&
    indexState.status !== "processing";
  const canAnalyze =
    connectionState.status === "configured" &&
    indexState.status === "ready" &&
    validWindow !== null &&
    analysisState.status !== "processing";

  return (
    <main className="twelvelabs-page">
      <header className="twelvelabs-header">
        <h1>TwelveLabs setup</h1>
        <p>
          Connect video understanding, index a source video, then request a
          Pegasus gesture suggestion.
        </p>
      </header>

      <WorkflowProgress
        connectionState={connectionState}
        indexState={indexState}
        analysisState={analysisState}
      />

      <div className="twelvelabs-workflow">
        <section
          className="twelvelabs-panel twelvelabs-connect"
          aria-labelledby="twelvelabs-connect-title"
          aria-busy={connectionState.status === "loading"}
        >
          <PanelHeading number="1" title="Connect" id="twelvelabs-connect-title" />
          <div className="twelvelabs-connect__body">
            <ConnectionStatus state={connectionState} />
            <button
              type="button"
              className="button twelvelabs-secondary-action"
              onClick={onCheckConnection}
              disabled={connectionState.status === "loading"}
            >
              <RefreshCw
                aria-hidden="true"
                className={
                  connectionState.status === "loading"
                    ? "is-spinning"
                    : undefined
                }
              />
              {connectionState.status === "loading"
                ? "Checking…"
                : "Check again"}
            </button>
          </div>
        </section>

        <section
          className="twelvelabs-panel"
          aria-labelledby="twelvelabs-index-title"
          aria-busy={indexState.status === "processing"}
        >
          <PanelHeading
            number="2"
            title="Index video"
            id="twelvelabs-index-title"
          />
          <form
            className="twelvelabs-index-form"
            onSubmit={(event) => submit(event, onStartIndexing)}
          >
            <div className="twelvelabs-field">
              <label htmlFor="twelvelabs-video-id">video_id</label>
              <input
                id="twelvelabs-video-id"
                name="video_id"
                list="twelvelabs-video-options"
                value={videoId}
                onChange={(event) =>
                  onVideoIdChange(event.currentTarget.value)
                }
                aria-describedby="twelvelabs-video-id-help"
                autoComplete="off"
                spellCheck={false}
              />
              <small id="twelvelabs-video-id-help">
                Choose a known source video or enter a stable video_id.
              </small>
            </div>
            <datalist id="twelvelabs-video-options">
              {videoOptions.map((option) => (
                <option value={option.video_id} key={option.video_id}>
                  {option.instance_id}
                </option>
              ))}
            </datalist>
            <button
              type="submit"
              className={`button button--primary twelvelabs-primary-action${
                canIndex ? "" : " button--disabled"
              }`}
              disabled={!canIndex}
            >
              {indexState.status === "processing" ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <Video aria-hidden="true" />
              )}
              {indexState.status === "processing"
                ? "Indexing…"
                : "Start indexing"}
            </button>
          </form>
          <IndexStatus
            state={indexState}
            videoId={videoId}
            connectionState={connectionState}
          />
        </section>

        <section
          className="twelvelabs-panel twelvelabs-analyze"
          aria-labelledby="twelvelabs-analyze-title"
          aria-busy={analysisState.status === "processing"}
        >
          <PanelHeading
            number="3"
            title="Analyze gestures"
            id="twelvelabs-analyze-title"
          />
          <form onSubmit={(event) => submit(event, onAnalyze)}>
            <div className="twelvelabs-window-heading">
              <div>
                <h3>Particle analysis window</h3>
                <p>
                  Absolute milliseconds on the selected source-video timeline.
                </p>
              </div>
              {validWindow === null ? null : (
                <output>
                  {formatRange(validWindow.analysis_window)}
                </output>
              )}
            </div>

            <AnalysisTimeline context={validWindow} />

            <div
              className="twelvelabs-time-fields"
              aria-describedby="twelvelabs-window-help"
            >
              <TimeInput
                id="twelvelabs-window-start"
                label="Window start (ms)"
                value={windowDraft.window_start_ms}
                onChange={(value) =>
                  onWindowValueChange("window_start_ms", value)
                }
              />
              <TimeInput
                id="twelvelabs-window-end"
                label="Window end (ms)"
                value={windowDraft.window_end_ms}
                onChange={(value) =>
                  onWindowValueChange("window_end_ms", value)
                }
              />
              <TimeInput
                id="twelvelabs-particle-start"
                label="Particle start (ms)"
                value={windowDraft.particle_start_ms}
                onChange={(value) =>
                  onWindowValueChange("particle_start_ms", value)
                }
              />
              <TimeInput
                id="twelvelabs-particle-end"
                label="Particle end (ms)"
                value={windowDraft.particle_end_ms}
                onChange={(value) =>
                  onWindowValueChange("particle_end_ms", value)
                }
              />
            </div>
            <p
              id="twelvelabs-window-help"
              className={
                windowError === null
                  ? "twelvelabs-field-help"
                  : "twelvelabs-field-error"
              }
              role={windowError === null ? undefined : "alert"}
            >
              {windowError ??
                "The particle interval must remain inside the analysis window."}
            </p>

            <button
              type="submit"
              className={`button button--primary twelvelabs-analyze-action${
                canAnalyze ? "" : " button--disabled"
              }`}
              disabled={!canAnalyze}
            >
              {analysisState.status === "processing" ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {analysisState.status === "processing"
                ? "Analyzing…"
                : "Run Pegasus analysis"}
            </button>
          </form>

          <AnalysisResult state={analysisState} />
        </section>
      </div>
    </main>
  );
}

function WorkflowProgress({
  connectionState,
  indexState,
  analysisState,
}: Readonly<{
  connectionState: ConnectionViewState;
  indexState: IndexViewState;
  analysisState: AnalysisViewState;
}>) {
  const currentStep =
    connectionState.status !== "configured"
      ? 1
      : indexState.status !== "ready"
        ? 2
        : 3;
  const allComplete = analysisState.status === "ready";
  const steps = ["Connect", "Index video", "Analyze gestures"] as const;

  return (
    <ol className="twelvelabs-steps" aria-label="TwelveLabs setup progress">
      {steps.map((label, index) => {
        const step = index + 1;
        const complete = allComplete || step < currentStep;
        const current = !allComplete && step === currentStep;
        return (
          <li
            className={`${complete ? "is-complete" : ""}${
              current ? " is-current" : ""
            }`}
            aria-current={current ? "step" : undefined}
            key={label}
          >
            <span aria-hidden="true">
              {complete ? <Check /> : step}
            </span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}

function PanelHeading({
  number,
  title,
  id,
}: Readonly<{ number: string; title: string; id: string }>) {
  return (
    <header className="twelvelabs-panel__heading">
      <span aria-hidden="true">{number}</span>
      <h2 id={id}>{title}</h2>
    </header>
  );
}

function ConnectionStatus({
  state,
}: Readonly<{ state: ConnectionViewState }>) {
  if (state.status === "loading") {
    return (
      <div
        className="twelvelabs-status twelvelabs-status--loading"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle className="is-spinning" aria-hidden="true" />
        <div>
          <strong>Checking server configuration</strong>
          <p>Reading connection status without exposing the secret.</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="twelvelabs-status twelvelabs-status--failed"
        role="alert"
      >
        <AlertCircle aria-hidden="true" />
        <div>
          <strong>Status unavailable</strong>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const configured = state.status === "configured";
  return (
    <div
      className={`twelvelabs-status ${
        configured
          ? "twelvelabs-status--ready"
          : "twelvelabs-status--empty"
      }`}
      role="status"
      aria-live="polite"
    >
      {configured ? (
        <CheckCircle2 aria-hidden="true" />
      ) : (
        <KeyRound aria-hidden="true" />
      )}
      <div>
        <div className="twelvelabs-status__title">
          <code>TWELVELABS_API_KEY</code>
          <span>{configured ? "Configured" : "Not configured"}</span>
        </div>
        <p>
          {configured
            ? "Configured server-side. The secret is never sent to or stored in this browser."
            : "Set TWELVELABS_API_KEY in the server environment, then check again. This browser never receives the secret."}
        </p>
      </div>
    </div>
  );
}

function IndexStatus({
  state,
  videoId,
  connectionState,
}: Readonly<{
  state: IndexViewState;
  videoId: string;
  connectionState: ConnectionViewState;
}>) {
  if (state.status === "processing") {
    return (
      <OperationStatus
        variant="processing"
        title={`Indexing ${videoId.trim()}`}
        message="The server is preparing this video for analysis."
      />
    );
  }
  if (state.status === "ready") {
    return (
      <OperationStatus
        variant="ready"
        title="Ready for analysis"
        message={`The server reports that video_id ${videoId.trim()} is indexed.`}
      />
    );
  }
  if (state.status === "failed") {
    return (
      <OperationStatus
        variant="failed"
        title="Indexing failed"
        message={state.message}
      />
    );
  }

  const message =
    connectionState.status === "configured"
      ? "Start indexing after choosing a source video."
      : "Configure the server-side key before starting an index.";
  return (
    <OperationStatus
      variant="empty"
      title="No indexing request started"
      message={message}
    />
  );
}

function OperationStatus({
  variant,
  title,
  message,
}: Readonly<{
  variant: "empty" | "processing" | "ready" | "failed";
  title: string;
  message: string;
}>) {
  const Icon =
    variant === "processing"
      ? LoaderCircle
      : variant === "ready"
        ? CheckCircle2
        : variant === "failed"
          ? AlertCircle
          : CircleDashed;
  return (
    <div
      className={`twelvelabs-operation twelvelabs-operation--${variant}`}
      role={variant === "failed" ? "alert" : "status"}
      aria-live={variant === "failed" ? "assertive" : "polite"}
    >
      <Icon
        aria-hidden="true"
        className={variant === "processing" ? "is-spinning" : undefined}
      />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

function AnalysisTimeline({
  context,
}: Readonly<{
  context: ReturnType<typeof validWindowContext>;
}>) {
  if (context === null) {
    return (
      <div className="twelvelabs-timeline twelvelabs-timeline--empty">
        <CircleDashed aria-hidden="true" />
        <p>Enter a valid source-video window to preview its particle interval.</p>
      </div>
    );
  }

  const duration =
    context.analysis_window.end_ms - context.analysis_window.start_ms;
  const particleOffset =
    context.particle_interval.start_ms -
    context.analysis_window.start_ms;
  const particleDuration =
    context.particle_interval.end_ms -
    context.particle_interval.start_ms;
  const style = {
    "--particle-start": `${(particleOffset / duration) * 100}%`,
    "--particle-width": `${(particleDuration / duration) * 100}%`,
  } as CSSProperties;

  return (
    <figure className="twelvelabs-timeline" style={style}>
      <figcaption>
        <span>
          {formatMilliseconds(context.analysis_window.start_ms)}
        </span>
        <strong>
          Particle {formatRange(context.particle_interval)}
        </strong>
        <span>{formatMilliseconds(context.analysis_window.end_ms)}</span>
      </figcaption>
      <div className="twelvelabs-timeline__rail" aria-hidden="true">
        <i />
      </div>
      <div className="twelvelabs-timeline__legend">
        <span>Analysis window</span>
        <span>Particle interval</span>
      </div>
    </figure>
  );
}

function TimeInput({
  id,
  label,
  value,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}>) {
  return (
    <label className="twelvelabs-time-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.currentTarget.value === ""
              ? null
              : event.currentTarget.valueAsNumber,
          )
        }
      />
    </label>
  );
}

function AnalysisResult({
  state,
}: Readonly<{ state: AnalysisViewState }>) {
  if (state.status === "processing") {
    return (
      <div
        className="twelvelabs-result twelvelabs-result--processing"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle className="is-spinning" aria-hidden="true" />
        <div>
          <h3>Pegasus is analyzing this window</h3>
          <p>The result will remain an unreviewed suggestion.</p>
        </div>
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div
        className="twelvelabs-result twelvelabs-result--failed"
        role="alert"
      >
        <AlertCircle aria-hidden="true" />
        <div>
          <h3>Gesture analysis failed</h3>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }
  if (state.status === "idle") {
    return (
      <div
        className="twelvelabs-result twelvelabs-result--empty"
        role="status"
      >
        <Bot aria-hidden="true" />
        <div>
          <h3>No gesture suggestion yet</h3>
          <p>
            Index the selected video, verify the window, then run Pegasus
            analysis.
          </p>
        </div>
      </div>
    );
  }

  const suggestion = state.suggestion;
  const noGesture = suggestion.gesture_type === "none";
  const values = [
    ["Gesture type", humanizeCode(suggestion.gesture_type)],
    [
      "Region",
      suggestion.gesture_region === null
        ? "Not applicable"
        : humanizeCode(suggestion.gesture_region),
    ],
    [
      "Start",
      suggestion.start_ms === null
        ? "Not applicable"
        : formatMilliseconds(suggestion.start_ms),
    ],
    [
      "End",
      suggestion.end_ms === null
        ? "Not applicable"
        : formatMilliseconds(suggestion.end_ms),
    ],
    ["Confidence", `${Math.round(suggestion.confidence * 100)}%`],
    ["Provenance", suggestion.provenance],
  ] as const;

  return (
    <div
      className="twelvelabs-result twelvelabs-result--suggestion"
      role="status"
      aria-live="polite"
    >
      <div className="twelvelabs-result__intro">
        <Sparkles aria-hidden="true" />
        <div>
          <h3>AI suggestion — human review required.</h3>
          <p>
            {noGesture
              ? "Pegasus did not find a clear gesture. A researcher must still review this suggestion."
              : "Review this suggestion in the coding workspace before it can enter the corpus."}
          </p>
        </div>
      </div>
      <dl>
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function draftFromOption(option: TwelveLabsVideoOption): AnalysisWindowDraft {
  return {
    window_start_ms: option.analysis_window.start_ms,
    window_end_ms: option.analysis_window.end_ms,
    particle_start_ms: option.particle_interval.start_ms,
    particle_end_ms: option.particle_interval.end_ms,
  };
}

function validWindowContext(draft: AnalysisWindowDraft): {
  readonly analysis_window: TimeRange;
  readonly particle_interval: TimeRange;
} | null {
  if (windowValidationMessage(draft) !== null) {
    return null;
  }
  return {
    analysis_window: {
      start_ms: draft.window_start_ms as number,
      end_ms: draft.window_end_ms as number,
    },
    particle_interval: {
      start_ms: draft.particle_start_ms as number,
      end_ms: draft.particle_end_ms as number,
    },
  };
}

export function windowValidationMessage(
  draft: AnalysisWindowDraft,
): string | null {
  const values = [
    draft.window_start_ms,
    draft.window_end_ms,
    draft.particle_start_ms,
    draft.particle_end_ms,
  ];
  if (values.some((value) => value === null)) {
    return "Enter all four source-video timestamps.";
  }
  if (
    values.some(
      (value) =>
        value === null || !Number.isSafeInteger(value) || value < 0,
    )
  ) {
    return "Timestamps must be non-negative integer milliseconds.";
  }

  const windowStart = draft.window_start_ms as number;
  const windowEnd = draft.window_end_ms as number;
  const particleStart = draft.particle_start_ms as number;
  const particleEnd = draft.particle_end_ms as number;
  if (windowEnd <= windowStart) {
    return "Window end must be after window start.";
  }
  if (particleEnd <= particleStart) {
    return "Particle end must be after particle start.";
  }
  if (particleStart < windowStart || particleEnd > windowEnd) {
    return "The particle interval must stay inside the analysis window.";
  }
  return null;
}

function requestErrorMessage(error: unknown, fallback: string): string {
  return error instanceof TwelveLabsUiRequestError ? error.message : fallback;
}

function submit(event: FormEvent<HTMLFormElement>, action: () => void) {
  event.preventDefault();
  action();
}

function formatMilliseconds(milliseconds: number): string {
  return `${milliseconds.toLocaleString("en-US")} ms`;
}

function formatRange(range: TimeRange): string {
  return `${range.start_ms.toLocaleString(
    "en-US",
  )}–${range.end_ms.toLocaleString("en-US")} ms`;
}
