"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Filter,
  RotateCcw,
} from "lucide-react";
import {
  CLIP_STATUSES,
  SENTENCE_TYPES,
  TARGET_PARTICLES,
} from "@/lib/vocab.ts";
import type {
  ClipListItem,
  ReviewSummary,
} from "@/lib/track-c/types.ts";

interface QueuePageProps {
  readonly clips: readonly ClipListItem[];
  readonly clipSummaries: Readonly<Record<string, ReviewSummary>>;
}

type ResetState = "idle" | "resetting" | "error";

export function QueuePage({ clips, clipSummaries }: QueuePageProps) {
  const router = useRouter();
  const [particleFilter, setParticleFilter] = useState("");
  const [sentenceFilter, setSentenceFilter] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [videoFilter, setVideoFilter] = useState("");
  const [resetState, setResetState] = useState<ResetState>("idle");
  const pendingClips = clips.filter(
    ({ status }) => status === "draft" || status === "in_review",
  );
  const priorityClip = pendingClips[0];
  const prioritySummary =
    priorityClip === undefined ? undefined : clipSummaries[priorityClip.id];
  const isComplete = pendingClips.length === 0;
  const summaryValues = Object.values(clipSummaries);
  const aggregateResolved = summaryValues.reduce(
    (total, summary) => total + summary.confirmed + summary.skipped,
    0,
  );
  const aggregateFields = summaryValues.reduce(
    (total, summary) => total + summary.total,
    0,
  );
  const resolved =
    prioritySummary === undefined
      ? aggregateResolved
      : prioritySummary.confirmed + prioritySummary.skipped;
  const total =
    prioritySummary === undefined ? aggregateFields : prioritySummary.total;
  const speakers = Array.from(
    new Map(
      clips.map((clip) => [clip.speaker_id, clip.speaker_label]),
    ).entries(),
  );
  const videos = Array.from(new Set(clips.map(({ video_id }) => video_id)));
  const matchingClips = pendingClips.filter(
    (clip) =>
      (particleFilter === "" || particleFilter === clip.particle) &&
      (sentenceFilter === "" ||
        sentenceFilter === clip.sentence_type) &&
      (speakerFilter === "" || speakerFilter === clip.speaker_id) &&
      (statusFilter === "" || statusFilter === clip.status) &&
      (videoFilter === "" || videoFilter === clip.video_id),
  );

  const resetDemo = async () => {
    setResetState("resetting");
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) {
        throw new Error("Demo reset failed.");
      }
      setParticleFilter("");
      setSentenceFilter("");
      setSpeakerFilter("");
      setStatusFilter("");
      setVideoFilter("");
      setResetState("idle");
      router.refresh();
    } catch {
      setResetState("error");
    }
  };

  return (
    <main className="queue-page">
      <header className="queue-header">
        <div>
          <span className="queue-eyebrow">Human review workspace</span>
          <h1>Coding queue</h1>
          <p>
            Resolve the least-certain suggestions first. Only reviewed coding
            enters the confirmed corpus.
          </p>
        </div>
        <div className="queue-header__actions">
          <button
            type="button"
            className="button queue-reset"
            onClick={() => void resetDemo()}
            disabled={resetState === "resetting"}
          >
            <RotateCcw aria-hidden="true" />
            {resetState === "resetting" ? "Resetting…" : "Reset demo"}
          </button>
          {priorityClip === undefined ? null : (
            <Link
              href={`/clips/${priorityClip.id}`}
              className="button button--primary queue-header__action"
              prefetch={false}
            >
              Review priority clip
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      <div className="queue-overview" aria-label="Review summary">
        <div>
          <span>Queue</span>
          <strong>
            {isComplete
              ? "All caught up"
              : pendingClips.length === 1
                ? "1 clip needs review"
                : `${pendingClips.length} clips need review`}
          </strong>
          <small>
            {isComplete
              ? `${clips.length} demo clips confirmed`
              : "Lowest confidence first"}
          </small>
        </div>
        <div>
          <span>{isComplete ? "Corpus progress" : "Priority progress"}</span>
          <strong>
            {resolved} / {total}
          </strong>
          <small>Fields reviewed</small>
        </div>
        <div>
          <span>{isComplete ? "Result" : "Lowest confidence"}</span>
          <strong>
            {isComplete
              ? "Confirmed"
              : priorityClip?.lowest_confidence === null ||
                  priorityClip?.lowest_confidence === undefined
                ? "Needs review"
                : `${Math.round(priorityClip.lowest_confidence * 100)}%`}
          </strong>
          <small>
            {isComplete
              ? "Ready for the corpus"
              : `Proposed: ${humanize(
                  priorityClip?.communicative_function ?? "AI suggestion",
                )}`}
          </small>
        </div>
      </div>

      {resetState === "error" ? (
        <p className="queue-alert" role="alert">
          The demo could not be reset. Refresh the page and try again.
        </p>
      ) : null}

      {isComplete ? (
        <section className="queue-complete" aria-labelledby="queue-complete-title">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <span>Review complete</span>
            <h2 id="queue-complete-title">The queue is clear.</h2>
            <p>
              Every coding field has a human decision. The demo clips are ready
              for the confirmed corpus.
            </p>
          </div>
          <button
            type="button"
            className="button"
            onClick={() => void resetDemo()}
            disabled={resetState === "resetting"}
          >
            Reset for another run
          </button>
        </section>
      ) : (
        <>
          <section className="queue-filters" aria-label="Queue filters">
            <div className="queue-filters__label">
              <Filter aria-hidden="true" />
              <span>Filter queue</span>
            </div>
            <label>
              <span>Video</span>
              <select
                value={videoFilter}
                onChange={(event) => setVideoFilter(event.currentTarget.value)}
              >
                <option value="">All videos</option>
                {videos.map((videoId) => (
                  <option value={videoId} key={videoId}>
                    {videoId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Particle</span>
              <select
                value={particleFilter}
                onChange={(event) =>
                  setParticleFilter(event.currentTarget.value)
                }
              >
                <option value="">All particles</option>
                {TARGET_PARTICLES.map(({ token, pinyin }) => (
                  <option value={token} key={token}>
                    {token} · {pinyin}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sentence type</span>
              <select
                value={sentenceFilter}
                onChange={(event) =>
                  setSentenceFilter(event.currentTarget.value)
                }
              >
                <option value="">All sentence types</option>
                {SENTENCE_TYPES.map((sentenceType) => (
                  <option value={sentenceType} key={sentenceType}>
                    {humanize(sentenceType)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Speaker</span>
              <select
                value={speakerFilter}
                onChange={(event) =>
                  setSpeakerFilter(event.currentTarget.value)
                }
              >
                <option value="">All speakers</option>
                {speakers.map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
              >
                <option value="">All statuses</option>
                {CLIP_STATUSES.filter(
                  (status) => status === "draft" || status === "in_review",
                ).map((status) => (
                  <option value={status} key={status}>
                    {humanize(status)}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="queue-table-wrap" aria-labelledby="queue-table-title">
            <div className="queue-table__caption">
              <div>
                <h2 id="queue-table-title">Needs attention</h2>
                <p aria-live="polite">
                  {matchingClips.length} clip
                  {matchingClips.length === 1 ? "" : "s"} match these filters
                </p>
              </div>
              <span>Lowest confidence first</span>
            </div>
            <table className="queue-table">
              <thead>
                <tr>
                  <th scope="col">Clip</th>
                  <th scope="col">Particle</th>
                  <th scope="col">Proposed meaning</th>
                  <th scope="col">Sentence type</th>
                  <th scope="col">Speaker</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-sort="ascending">
                    Lowest confidence
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {matchingClips.length > 0 ? (
                  matchingClips.map((clip, index) => (
                    <tr
                      className={
                        index === 0 ? "queue-table__recommended" : undefined
                      }
                      key={clip.id}
                    >
                      <td>
                        <strong>{clip.transcript}</strong>
                        <span>
                          Demo clip · {(clip.duration_ms / 1_000).toFixed(1)}{" "}
                          seconds
                        </span>
                      </td>
                      <td lang="zh-Hans">{clip.particle}</td>
                      <td>{humanize(clip.communicative_function)}</td>
                      <td>{humanize(clip.sentence_type)}</td>
                      <td>{clip.speaker_label}</td>
                      <td>
                        <span className="queue-status">
                          {humanize(clip.status)}
                        </span>
                      </td>
                      <td>
                        <span className="confidence-value">
                          {clip.lowest_confidence === null
                            ? "—"
                            : `${Math.round(clip.lowest_confidence * 100)}%`}
                        </span>
                        <small>AI suggestion</small>
                      </td>
                      <td>
                        <Link
                          href={`/clips/${clip.id}`}
                          className="queue-open"
                          aria-label={`Review ${clip.transcript}`}
                          prefetch={false}
                        >
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="queue-empty">
                      No review clips match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      <p className="queue-honesty">
        Demo data is clearly labeled and never presented as a research finding
        or a measure of model accuracy.
      </p>
    </main>
  );
}

function humanize(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
