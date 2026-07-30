"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
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
  Upload,
  Video,
} from "lucide-react";
import { createGestureAnalysisWindow } from "@/lib/track-b/analysis-window.ts";
import { TWELVELABS_MAX_DIRECT_UPLOAD_BYTES } from "@/lib/twelvelabs/contracts.ts";
import type { FinalParticleInstance, TimeRange } from "@/lib/types.ts";
import { humanizeCode } from "@/lib/track-c/display.ts";
import {
  analyzeTwelveLabsGesture,
  createTwelveLabsDestination,
  getTwelveLabsConnectionStatus,
  startTwelveLabsIndex,
  TwelveLabsUiRequestError,
  type TwelveLabsGestureSuggestion,
  type TwelveLabsIndexResult,
} from "./twelvelabs-client.ts";

export interface TwelveLabsVideoOption {
  readonly video_id: string;
  readonly instance_id: string;
  readonly video_duration_ms: number;
  readonly source_url: string;
  readonly analysis_window: TimeRange;
  readonly particle_interval: TimeRange;
  readonly particle: FinalParticleInstance;
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
  | {
      readonly status: "ready";
      readonly result: TwelveLabsIndexResult;
    }
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
  readonly instanceId: string;
  readonly indexId: string;
  readonly videoUrl: string;
  readonly videoFile: File | null;
  readonly fileInputResetKey: number;
  readonly windowDraft: AnalysisWindowDraft;
  readonly connectionState: ConnectionViewState;
  readonly indexState: IndexViewState;
  readonly analysisState: AnalysisViewState;
  readonly onVideoIdChange: (videoId: string) => void;
  readonly onInstanceIdChange: (instanceId: string) => void;
  readonly onIndexIdChange: (indexId: string) => void;
  readonly onVideoUrlChange: (videoUrl: string) => void;
  readonly onVideoFileChange: (videoFile: File | null) => void;
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
  const [instanceId, setInstanceId] = useState(
    initialOption?.instance_id ?? "",
  );
  const [indexId, setIndexId] = useState("");
  const [videoUrl, setVideoUrl] = useState(
    initialOption?.source_url.startsWith("https://")
      ? initialOption.source_url
      : "",
  );
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [fileInputResetKey, setFileInputResetKey] = useState(0);
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
    setInstanceId(knownVideo?.instance_id ?? "");
    setVideoUrl(
      videoFile === null && knownVideo?.source_url.startsWith("https://")
        ? knownVideo.source_url
        : "",
    );
    setWindowDraft(
      knownVideo === undefined
        ? EMPTY_WINDOW_DRAFT
        : draftFromOption(knownVideo),
    );
    resetOperations();
  };

  const handleInstanceIdChange = (nextInstanceId: string) => {
    setInstanceId(nextInstanceId);
    const option = videoOptions.find(
      (candidate) =>
        candidate.video_id === videoId.trim() &&
        candidate.instance_id === nextInstanceId,
    );
    setWindowDraft(
      option === undefined ? EMPTY_WINDOW_DRAFT : draftFromOption(option),
    );
    analysisRequest.current += 1;
    setAnalysisState({ status: "idle" });
  };

  const handleWindowValueChange = (
    field: keyof AnalysisWindowDraft,
    value: number | null,
  ) => {
    analysisRequest.current += 1;
    setWindowDraft((current) => ({ ...current, [field]: value }));
    setAnalysisState({ status: "idle" });
  };

  const handleIndexIdChange = (nextIndexId: string) => {
    setIndexId(nextIndexId);
    resetOperations();
  };

  const handleVideoUrlChange = (nextVideoUrl: string) => {
    setVideoUrl(nextVideoUrl);
    if (nextVideoUrl.trim().length > 0 && videoFile !== null) {
      setVideoFile(null);
      setFileInputResetKey((current) => current + 1);
    }
    resetOperations();
  };

  const handleVideoFileChange = (nextVideoFile: File | null) => {
    setVideoFile(nextVideoFile);
    if (nextVideoFile !== null) {
      setVideoUrl("");
    }
    resetOperations();
  };

  const handleStartIndexing = async () => {
    const fileError = videoFileValidationMessage(videoFile);
    const hasUploadSource =
      videoFile !== null
        ? fileError === null
        : videoUrl.trim().length > 0;
    if (
      connectionState.status !== "configured" ||
      videoId.trim().length === 0 ||
      !hasUploadSource ||
      indexState.status === "processing"
    ) {
      return;
    }

    const requestId = ++indexRequest.current;
    analysisRequest.current += 1;
    setIndexState({ status: "processing" });
    setAnalysisState({ status: "idle" });

    try {
      const destination =
        indexId.trim().length > 0
          ? indexId.trim()
          : (await createTwelveLabsDestination(videoId.trim())).index_id;
      if (requestId !== indexRequest.current) {
        return;
      }
      if (destination !== indexId) {
        setIndexId(destination);
      }
      const result =
        videoFile === null
          ? await startTwelveLabsIndex({
              video_id: videoId.trim(),
              index_id: destination,
              video_url: videoUrl.trim(),
            })
          : await startTwelveLabsIndex({
              video_id: videoId.trim(),
              index_id: destination,
              video_file: videoFile,
              filename: videoFile.name,
            });
      if (requestId !== indexRequest.current) {
        return;
      }
      setIndexState(
        result.status === "failed"
          ? {
              status: "failed",
              message: "TwelveLabs reported that indexing failed.",
            }
          : result.status === "ready"
            ? { status: "ready", result }
            : {
                status: "failed",
                message:
                  "TwelveLabs did not finish indexing within the polling window.",
              },
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
    const selectedOption = videoOptions.find(
      (option) =>
        option.video_id === videoId.trim() &&
        option.instance_id === instanceId,
    );
    const validWindow = validWindowContext(
      windowDraft,
      selectedOption?.video_duration_ms,
    );
    if (
      connectionState.status !== "configured" ||
      indexState.status !== "ready" ||
      selectedOption === undefined ||
      validWindow === null ||
      analysisState.status === "processing"
    ) {
      return;
    }

    const requestId = ++analysisRequest.current;
    setAnalysisState({ status: "processing" });
    try {
      if (
        validWindow.particle_interval.start_ms !==
          selectedOption.particle.fp_start_ms ||
        validWindow.particle_interval.end_ms !==
          selectedOption.particle.fp_end_ms ||
        validWindow.analysis_window.start_ms !==
          selectedOption.analysis_window.start_ms ||
        validWindow.analysis_window.end_ms !==
          selectedOption.analysis_window.end_ms
      ) {
        throw new TwelveLabsUiRequestError(
          "Analysis must use the retained, source-bounded Track A particle window.",
        );
      }
      const particle = selectedOption.particle;
      const expectedWindow = createGestureAnalysisWindow(
        particle,
        selectedOption.video_duration_ms,
      );
      if (
        expectedWindow.start_ms !== validWindow.analysis_window.start_ms ||
        expectedWindow.end_ms !== validWindow.analysis_window.end_ms
      ) {
        throw new TwelveLabsUiRequestError(
          "The analysis window must remain the source-bounded ±2000ms Track B window around the particle.",
        );
      }
      const suggestion = await analyzeTwelveLabsGesture({
        video_id: selectedOption.video_id,
        instance_id: selectedOption.instance_id,
        asset_id: indexState.result.asset_id,
        video_duration_ms: selectedOption.video_duration_ms,
        particle,
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
      instanceId={instanceId}
      indexId={indexId}
      videoUrl={videoUrl}
      videoFile={videoFile}
      fileInputResetKey={fileInputResetKey}
      windowDraft={windowDraft}
      connectionState={connectionState}
      indexState={indexState}
      analysisState={analysisState}
      onVideoIdChange={handleVideoIdChange}
      onInstanceIdChange={handleInstanceIdChange}
      onIndexIdChange={handleIndexIdChange}
      onVideoUrlChange={handleVideoUrlChange}
      onVideoFileChange={handleVideoFileChange}
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
  instanceId,
  indexId,
  videoUrl,
  videoFile,
  fileInputResetKey,
  windowDraft,
  connectionState,
  indexState,
  analysisState,
  onVideoIdChange,
  onInstanceIdChange,
  onIndexIdChange,
  onVideoUrlChange,
  onVideoFileChange,
  onWindowValueChange,
  onCheckConnection,
  onStartIndexing,
  onAnalyze,
}: TwelveLabsIntegrationViewProps) {
  const selectedOption = videoOptions.find(
    (option) =>
      option.video_id === videoId.trim() &&
      option.instance_id === instanceId,
  );
  const windowError = windowValidationMessage(
    windowDraft,
    selectedOption?.video_duration_ms,
  );
  const validWindow = validWindowContext(
    windowDraft,
    selectedOption?.video_duration_ms,
  );
  const knownVideo = videoOptions.some(
    ({ video_id: optionVideoId }) => optionVideoId === videoId.trim(),
  );
  const fileError = videoFileValidationMessage(videoFile);
  const hasUploadSource =
    videoFile !== null
      ? fileError === null
      : videoUrl.trim().length > 0;
  const canIndex =
    connectionState.status === "configured" &&
    videoId.trim().length > 0 &&
    hasUploadSource &&
    indexState.status !== "processing";
  const canAnalyze =
    connectionState.status === "configured" &&
    indexState.status === "ready" &&
    selectedOption !== undefined &&
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
            title="Upload & index video"
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
                Enter a stable ID for this source video. Registered IDs also
                unlock particle analysis after indexing.
              </small>
            </div>
            <datalist id="twelvelabs-video-options">
              {videoOptions.map((option) => (
                <option
                  value={option.video_id}
                  key={`${option.video_id}:${option.instance_id}`}
                >
                  {option.instance_id}
                </option>
              ))}
            </datalist>
            <label className="twelvelabs-field" htmlFor="twelvelabs-index-id">
              <span>TwelveLabs index_id</span>
              <input
                id="twelvelabs-index-id"
                name="index_id"
                value={indexId}
                onChange={(event) =>
                  onIndexIdChange(event.currentTarget.value)
                }
                autoComplete="off"
                spellCheck={false}
              />
              <small>
                Optional. Leave blank and the app will create a Pegasus index
                automatically.
              </small>
            </label>
            <label
              className="twelvelabs-field"
              htmlFor="twelvelabs-video-file"
            >
              <span>Local video file</span>
              <input
                key={fileInputResetKey}
                id="twelvelabs-video-file"
                name="video_file"
                type="file"
                accept="video/*,.mp4,.mov,.m4v,.webm"
                aria-describedby={
                  fileError === null
                    ? "twelvelabs-video-file-help"
                    : "twelvelabs-video-file-help twelvelabs-video-file-error"
                }
                aria-invalid={fileError === null ? undefined : true}
                onChange={(event) =>
                  onVideoFileChange(
                    event.currentTarget.files?.item(0) ?? null,
                  )
                }
              />
              {videoFile === null ? null : (
                <output
                  className="twelvelabs-file-summary"
                  aria-live="polite"
                >
                  <strong>{videoFile.name}</strong>
                  <span>{formatFileSize(videoFile.size)}</span>
                </output>
              )}
              <small id="twelvelabs-video-file-help">
                Choose a video up to 200 MB. It uploads only after you click
                the button below.
              </small>
              {fileError === null ? null : (
                <small
                  id="twelvelabs-video-file-error"
                  className="twelvelabs-field-error"
                  role="alert"
                >
                  {fileError}
                </small>
              )}
            </label>
            <label className="twelvelabs-field" htmlFor="twelvelabs-video-url">
              <span>Or use a public video URL</span>
              <input
                id="twelvelabs-video-url"
                name="video_url"
                type="url"
                placeholder="https://…"
                value={videoUrl}
                onChange={(event) =>
                  onVideoUrlChange(event.currentTarget.value)
                }
                autoComplete="url"
                spellCheck={false}
              />
              <small>
                TwelveLabs fetches this HTTPS URL server-side; the API key
                remains on the server.
              </small>
            </label>
            <button
              type="submit"
              className={`button button--primary twelvelabs-primary-action${
                canIndex ? "" : " button--disabled"
              }`}
              disabled={!canIndex}
            >
              {indexState.status === "processing" ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : videoFile !== null ? (
                <Upload aria-hidden="true" />
              ) : (
                <Video aria-hidden="true" />
              )}
              {indexState.status === "processing"
                ? "Uploading & indexing…"
                : videoFile === null
                  ? "Index public URL"
                  : "Upload & index file"}
            </button>
          </form>
          <IndexStatus
            state={indexState}
            videoId={videoId}
            connectionState={connectionState}
            analysisReady={knownVideo}
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
          {!knownVideo && videoId.trim().length > 0 ? (
            <div className="twelvelabs-ingest-note" role="note">
              <strong>Upload and indexing are available for this video.</strong>
              <p>
                Gesture analysis stays locked until this exact video has a
                reviewed transcript and retained particle timing. Demo timing
                is never applied to a new upload.
              </p>
            </div>
          ) : null}
          <form onSubmit={(event) => submit(event, onAnalyze)}>
            <label
              className="twelvelabs-field"
              htmlFor="twelvelabs-instance-id"
            >
              <span>Particle instance_id</span>
              <select
                id="twelvelabs-instance-id"
                name="instance_id"
                value={instanceId}
                onChange={(event) =>
                  onInstanceIdChange(event.currentTarget.value)
                }
                disabled={
                  videoOptions.every(
                    (option) => option.video_id !== videoId.trim(),
                  )
                }
              >
                {videoOptions
                  .filter((option) => option.video_id === videoId.trim())
                  .map((option) => (
                    <option
                      value={option.instance_id}
                      key={`${option.video_id}:${option.instance_id}`}
                    >
                      {option.instance_id}
                    </option>
                  ))}
              </select>
              <small>
                Each particle is analyzed independently and keeps this stable
                ID through the response.
              </small>
            </label>
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
                readOnly
              />
              <TimeInput
                id="twelvelabs-window-end"
                label="Window end (ms)"
                value={windowDraft.window_end_ms}
                onChange={(value) =>
                  onWindowValueChange("window_end_ms", value)
                }
                readOnly
              />
              <TimeInput
                id="twelvelabs-particle-start"
                label="Particle start (ms)"
                value={windowDraft.particle_start_ms}
                onChange={(value) =>
                  onWindowValueChange("particle_start_ms", value)
                }
                readOnly
              />
              <TimeInput
                id="twelvelabs-particle-end"
                label="Particle end (ms)"
                value={windowDraft.particle_end_ms}
                onChange={(value) =>
                  onWindowValueChange("particle_end_ms", value)
                }
                readOnly
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
                "The retained Track A timing is read-only; Pegasus receives this exact source-video window."}
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
  analysisReady,
}: Readonly<{
  state: IndexViewState;
  videoId: string;
  connectionState: ConnectionViewState;
  analysisReady: boolean;
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
        title={
          analysisReady
            ? "Ready for analysis"
            : "Upload and indexing complete"
        }
        message={
          analysisReady
            ? `The server reports that video_id ${videoId.trim()} is indexed.`
            : `The server indexed video_id ${videoId.trim()}. Register its transcript and particle timing to unlock analysis.`
        }
      >
        <dl className="twelvelabs-operation__details">
          <div>
            <dt>Asset ID</dt>
            <dd>{state.result.asset_id}</dd>
          </div>
          <div>
            <dt>Indexed asset ID</dt>
            <dd>{state.result.indexed_asset_id}</dd>
          </div>
          <div>
            <dt>Index ID</dt>
            <dd>{state.result.index_id}</dd>
          </div>
        </dl>
      </OperationStatus>
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
  children,
}: Readonly<{
  variant: "empty" | "processing" | "ready" | "failed";
  title: string;
  message: string;
  children?: ReactNode;
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
        {children}
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
  readOnly = false,
}: Readonly<{
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
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
        readOnly={readOnly}
        onChange={
          readOnly
            ? undefined
            : (event) =>
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
    [
      "Provenance",
      `${suggestion.provenance.provider} ${suggestion.provenance.model}`,
    ],
    ["video_id", suggestion.video_id],
    ["instance_id", suggestion.instance_id],
    ["Provider asset", suggestion.asset_id],
    [
      "Provider window",
      formatRange(suggestion.provenance.provider_window),
    ],
    [
      "Provider response",
      suggestion.provenance.response_id ?? "Not supplied",
    ],
    ["Review state", suggestion.confirmed ? "Confirmed" : "Unconfirmed"],
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
} | null;
function validWindowContext(
  draft: AnalysisWindowDraft,
  videoDurationMs?: number,
): {
  readonly analysis_window: TimeRange;
  readonly particle_interval: TimeRange;
} | null;
function validWindowContext(
  draft: AnalysisWindowDraft,
  videoDurationMs?: number,
): {
  readonly analysis_window: TimeRange;
  readonly particle_interval: TimeRange;
} | null {
  if (windowValidationMessage(draft, videoDurationMs) !== null) {
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

export function videoFileValidationMessage(
  file: Pick<File, "size"> | null,
): string | null {
  if (file === null) {
    return null;
  }
  if (file.size < 1) {
    return "Choose a non-empty video file.";
  }
  if (file.size > TWELVELABS_MAX_DIRECT_UPLOAD_BYTES) {
    return "The video file must be 200 MB or smaller.";
  }
  return null;
}

export function windowValidationMessage(
  draft: AnalysisWindowDraft,
  videoDurationMs?: number,
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
  if (
    videoDurationMs !== undefined &&
    (!Number.isSafeInteger(videoDurationMs) ||
      videoDurationMs <= 0 ||
      windowEnd > videoDurationMs)
  ) {
    return "The analysis window must stay inside the source video.";
  }
  return null;
}

function requestErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof TwelveLabsUiRequestError)) {
    return fallback;
  }
  return error.retryable
    ? `${error.message} This request can be retried.`
    : error.message;
}

function submit(event: FormEvent<HTMLFormElement>, action: () => void) {
  event.preventDefault();
  action();
}

function formatMilliseconds(milliseconds: number): string {
  return `${milliseconds.toLocaleString("en-US")} ms`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toLocaleString("en-US")} ${bytes === 1 ? "byte" : "bytes"}`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRange(range: TimeRange): string {
  return `${range.start_ms.toLocaleString(
    "en-US",
  )}–${range.end_ms.toLocaleString("en-US")} ms`;
}
