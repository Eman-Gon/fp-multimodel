"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Filter,
  RotateCcw,
  X,
} from "lucide-react";
import {
  CLIP_STATUSES,
  SENTENCE_TYPES,
  TARGET_PARTICLES,
} from "@/lib/vocab.ts";
import { humanizeCode } from "@/lib/track-c/display.ts";
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
  const [confidenceFilter, setConfidenceFilter] = useState("");
  const [resetState, setResetState] = useState<ResetState>("idle");

  const pendingClips = clips.filter(
    ({ status }) => status === "draft" || status === "in_review",
  );
  const isComplete = pendingClips.length === 0;
  const videos = Array.from(new Set(clips.map(({ video_id }) => video_id)));
  const speakers = Array.from(
    new Map(
      clips.map((clip) => [
        `${clip.video_id}:${clip.speaker_id}`,
        {
          key: `${clip.video_id}:${clip.speaker_id}`,
          label: `${clip.speaker_label} · ${clip.video_id}`,
        },
      ]),
    ).values(),
  );
  const matchingClips = pendingClips.filter(
    (clip) =>
      (particleFilter === "" || particleFilter === clip.particle) &&
      (sentenceFilter === "" || sentenceFilter === clip.sentence_type) &&
      (speakerFilter === "" ||
        speakerFilter === `${clip.video_id}:${clip.speaker_id}`) &&
      (statusFilter === "" || statusFilter === clip.status) &&
      (videoFilter === "" || videoFilter === clip.video_id) &&
      matchesConfidence(confidenceFilter, clip.lowest_confidence),
  );
  const priorityClip = matchingClips[0];
  const prioritySummary =
    priorityClip === undefined ? undefined : clipSummaries[priorityClip.id];
  const filterCount = [
    particleFilter,
    sentenceFilter,
    speakerFilter,
    statusFilter,
    videoFilter,
    confidenceFilter,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setParticleFilter("");
    setSentenceFilter("");
    setSpeakerFilter("");
    setStatusFilter("");
    setVideoFilter("");
    setConfidenceFilter("");
  };

  const resetDemo = async () => {
    if (
      !window.confirm(
        "Reset both demo clips? This removes every review decision made in this demo session.",
      )
    ) {
      return;
    }

    setResetState("resetting");
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) {
        throw new Error("Demo reset failed.");
      }
      clearFilters();
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
          <h1>Coding queue</h1>
          <p>Review the least-certain suggestions first.</p>
        </div>
        {priorityClip === undefined ? null : (
          <Link
            href={`/clips/${priorityClip.id}`}
            className="button button--primary queue-header__action"
            prefetch={false}
          >
            Review next clip
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
      </header>

      {resetState === "error" ? (
        <p className="queue-alert" role="alert">
          The demo could not be reset. Refresh the page and try again.
        </p>
      ) : null}

      {isComplete ? (
        <section
          className="queue-complete"
          aria-labelledby="queue-complete-title"
        >
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2 id="queue-complete-title">The review queue is clear.</h2>
            <p>
              Confirmed demo clips are now available in the reviewed corpus.
            </p>
          </div>
          <div className="queue-complete__actions">
            <Link href="/explore" className="button button--primary">
              Open reviewed clips
              <ArrowRight aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="button"
              onClick={() => void resetDemo()}
              disabled={resetState === "resetting"}
            >
              {resetState === "resetting" ? "Resetting…" : "Reset demo"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="queue-toolbar" aria-label="Queue summary">
            <div className="queue-toolbar__summary">
              <strong>
                {filterCount > 0
                  ? `${matchingClips.length} of ${pendingClips.length} clips shown`
                  : `${pendingClips.length} ${pendingClips.length === 1 ? "clip" : "clips"} to review`}
              </strong>
              {priorityClip === undefined ? (
                <span>No clips match the current filters.</span>
              ) : (
                <span>
                  Next decision:{" "}
                  {priorityClip.lowest_confidence_label ?? "Review suggested values"}
                  {priorityClip.lowest_confidence === null
                    ? ""
                    : ` · ${Math.round(priorityClip.lowest_confidence * 100)}% simulated triage confidence`}
                </span>
              )}
              {prioritySummary === undefined ? null : (
                <small>
                  {prioritySummary.confirmed + prioritySummary.skipped} of{" "}
                  {prioritySummary.total} review decisions complete
                </small>
              )}
            </div>
            <div className="queue-toolbar__actions">
              <details className="queue-filter-panel">
                <summary className="button">
                  <Filter aria-hidden="true" />
                  Filters{filterCount === 0 ? "" : ` (${filterCount})`}
                </summary>
                <div className="queue-filters">
                  <FilterSelect
                    label="Confidence"
                    value={confidenceFilter}
                    onChange={setConfidenceFilter}
                  >
                    <option value="">All confidence</option>
                    <option value="under-65">Under 65%</option>
                    <option value="65-79">65–79%</option>
                    <option value="80-plus">80%+</option>
                  </FilterSelect>
                  <FilterSelect
                    label="Video"
                    value={videoFilter}
                    onChange={setVideoFilter}
                  >
                    <option value="">All videos</option>
                    {videos.map((videoId) => (
                      <option value={videoId} key={videoId}>
                        {videoId}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Particle"
                    value={particleFilter}
                    onChange={setParticleFilter}
                  >
                    <option value="">All particles</option>
                    {TARGET_PARTICLES.map(({ token, pinyin }) => (
                      <option value={token} key={token}>
                        {token} · {pinyin}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Sentence type"
                    value={sentenceFilter}
                    onChange={setSentenceFilter}
                  >
                    <option value="">All sentence types</option>
                    {SENTENCE_TYPES.map((sentenceType) => (
                      <option value={sentenceType} key={sentenceType}>
                        {humanizeCode(sentenceType)}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Speaker"
                    value={speakerFilter}
                    onChange={setSpeakerFilter}
                  >
                    <option value="">All speakers</option>
                    {speakers.map(({ key, label }) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                  >
                    <option value="">All statuses</option>
                    {CLIP_STATUSES.filter(
                      (status) =>
                        status === "draft" || status === "in_review",
                    ).map((status) => (
                      <option value={status} key={status}>
                        {humanizeCode(status)}
                      </option>
                    ))}
                  </FilterSelect>
                  <button
                    type="button"
                    className="queue-filters__clear"
                    onClick={clearFilters}
                    disabled={filterCount === 0}
                  >
                    <X aria-hidden="true" />
                    Clear filters
                  </button>
                </div>
              </details>
              <button
                type="button"
                className="button queue-reset"
                onClick={() => void resetDemo()}
                disabled={resetState === "resetting"}
              >
                <RotateCcw aria-hidden="true" />
                {resetState === "resetting" ? "Resetting…" : "Reset demo"}
              </button>
            </div>
          </section>

          <section
            className="queue-table-wrap"
            aria-labelledby="queue-table-title"
          >
            <div className="queue-table__caption">
              <div>
                <h2 id="queue-table-title">Review queue</h2>
                <p aria-live="polite">Lowest pending confidence first</p>
              </div>
            </div>
            <table className="queue-table">
              <thead>
                <tr>
                  <th scope="col">Clip</th>
                  <th scope="col">Particle</th>
                  <th scope="col">Proposed meaning</th>
                  <th scope="col" aria-sort="ascending">
                    Next decision
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
                        <strong lang="zh-Hans">{clip.transcript}</strong>
                        <span>
                          {clip.video_id} ·{" "}
                          {(clip.duration_ms / 1_000).toFixed(1)}s ·{" "}
                          {clip.speaker_label} ·{" "}
                          {humanizeCode(clip.sentence_type)}
                        </span>
                      </td>
                      <td>
                        <strong lang="zh-Hans">{clip.particle}</strong>
                        <span>{clip.particle_pinyin}</span>
                      </td>
                      <td>{humanizeCode(clip.communicative_function)}</td>
                      <td>
                        <strong className="confidence-value">
                          {clip.lowest_confidence === null
                            ? "Needs review"
                            : `${Math.round(clip.lowest_confidence * 100)}%`}
                        </strong>
                        <span>
                          {clip.lowest_confidence_label ??
                            "Suggested values"}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/clips/${clip.id}`}
                          className="queue-open"
                          aria-label={`Review ${clip.transcript}`}
                          prefetch={false}
                        >
                          Review
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="queue-empty">
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
        Demo media, annotations, and confidence values are simulated. Nothing
        here is a research finding or a measure of model accuracy.
      </p>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}>) {
  return (
    <label>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </select>
    </label>
  );
}

function matchesConfidence(
  filter: string,
  confidence: number | null,
): boolean {
  if (filter === "") {
    return true;
  }
  if (confidence === null) {
    return false;
  }
  if (filter === "under-65") {
    return confidence < 0.65;
  }
  if (filter === "65-79") {
    return confidence >= 0.65 && confidence < 0.8;
  }
  return confidence >= 0.8;
}
