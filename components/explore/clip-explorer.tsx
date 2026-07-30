"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  ExternalLink,
  Layers3,
  LayoutList,
  Network,
} from "lucide-react";
import { EXTENDED_PARTICLE_CANDIDATES, TARGET_PARTICLES } from "@/lib/vocab.ts";
import type {
  ConfirmedExplorerClipListItem,
  VideoSourceReference,
} from "@/lib/track-c/types.ts";

interface ClipExplorerProps {
  readonly clips: readonly ConfirmedExplorerClipListItem[];
  readonly sourceReferences: readonly VideoSourceReference[];
}

export function ClipExplorer({ clips, sourceReferences }: ClipExplorerProps) {
  const [particle, setParticle] = useState("");
  const [meaning, setMeaning] = useState("");
  const particleClips =
    particle === ""
      ? clips
      : clips.filter((clip) => clip.particle === particle);
  const meanings = Array.from(
    new Set(particleClips.map((clip) => clip.communicative_function)),
  );
  const visibleClips =
    meaning === ""
      ? particleClips
      : particleClips.filter((clip) => clip.communicative_function === meaning);
  const uniqueVisibleClips = uniqueByClip(visibleClips);
  const reviewedClipCount = uniqueClipCount(clips);

  return (
    <main className="explorer-page">
      <header className="explorer-header">
        <div>
          <h1>Particle and meaning explorer</h1>
          <p>Browse clips after their coding has been human-confirmed.</p>
        </div>
        <div className="explorer-header__tools">
          <nav className="explorer-view-switch" aria-label="Explorer view">
            <Link
              href="/explore"
              className="is-selected"
              aria-current="page"
              prefetch={false}
            >
              <LayoutList aria-hidden="true" />
              Reviewed clips
            </Link>
            <Link href="/explore/graph" prefetch={false}>
              <Network aria-hidden="true" />
              Graph
            </Link>
          </nav>
          {clips.length === 0 ? null : (
            <div className="explorer-project-count">
              <Layers3 aria-hidden="true" />
              <strong>
                {new Set(clips.map(({ video_id }) => video_id)).size}
              </strong>
              <span>videos in reviewed clips</span>
            </div>
          )}
        </div>
      </header>

      {clips.length === 0 ? (
        <>
          <section
            className="explorer-zero-state"
            aria-labelledby="explorer-zero-title"
          >
            <BookOpenCheck aria-hidden="true" />
            <h2 id="explorer-zero-title">No reviewed clips yet</h2>
            <p>Finish reviewing a clip to add it to this demo corpus.</p>
            <Link
              href="/queue"
              className="button button--primary"
              prefetch={false}
            >
              Review coding queue
              <ArrowRight aria-hidden="true" />
            </Link>
          </section>
          <ResearchDetails sourceReferences={sourceReferences} />
        </>
      ) : (
        <>
          <section
            className="particle-rail"
            aria-label="Filter by final particle"
          >
            <button
              type="button"
              className={particle === "" ? "is-selected" : undefined}
              aria-pressed={particle === ""}
              onClick={() => {
                setParticle("");
                setMeaning("");
              }}
            >
              <strong>All</strong>
              <span>
                {reviewedClipCount}{" "}
                {reviewedClipCount === 1 ? "clip" : "clips"}
              </span>
            </button>
            {TARGET_PARTICLES.map(({ token, pinyin }) => {
              const count = uniqueClipCount(
                clips.filter((clip) => clip.particle === token),
              );
              return (
                <button
                  type="button"
                  className={particle === token ? "is-selected" : undefined}
                  aria-pressed={particle === token}
                  onClick={() => {
                    setParticle(token);
                    setMeaning("");
                  }}
                  key={token}
                >
                  <strong lang="zh-Hans">{token}</strong>
                  <span>
                    {pinyin} · {count}
                  </span>
                </button>
              );
            })}
          </section>

          <section
            className="meaning-filter"
            aria-labelledby="meaning-filter-title"
          >
            <div>
              <h2 id="meaning-filter-title">Reviewed meanings</h2>
              <p>Only confirmed review values are included.</p>
            </div>
            <div>
              <button
                type="button"
                className={meaning === "" ? "is-selected" : undefined}
                aria-pressed={meaning === ""}
                onClick={() => setMeaning("")}
              >
                All meanings <span>{uniqueClipCount(particleClips)}</span>
              </button>
              {meanings.map((item) => {
                const count = uniqueClipCount(
                  particleClips.filter(
                    (clip) => clip.communicative_function === item,
                  ),
                );
                return (
                  <button
                    type="button"
                    className={meaning === item ? "is-selected" : undefined}
                    aria-pressed={meaning === item}
                    onClick={() => setMeaning(item)}
                    key={item}
                  >
                    {humanize(item)} <span>{count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            className="explorer-results"
            id="explorer-results"
            aria-labelledby="explorer-results-title"
          >
            <header>
              <h2 id="explorer-results-title">
                {uniqueVisibleClips.length} matching{" "}
                {uniqueVisibleClips.length === 1 ? "clip" : "clips"}
              </h2>
            </header>
            <div className="explorer-list">
              {uniqueVisibleClips.length === 0 ? (
                <div className="explorer-empty" role="status">
                  <h3>No confirmed clips match these filters.</h3>
                  <p>
                    Choose another particle or reviewed meaning to see the
                    confirmed corpus.
                  </p>
                </div>
              ) : (
                uniqueVisibleClips.map((clip) => {
                  const clipParticles = Array.from(
                    new Set(
                      clips
                        .filter((candidate) => candidate.id === clip.id)
                        .map((candidate) => candidate.particle),
                    ),
                  ).join(" · ");
                  return (
                    <article key={clip.id}>
                      <div className="explorer-list__particle" lang="zh-Hans">
                        {clipParticles}
                      </div>
                      <div>
                        <span>
                          {clip.video_id} ·{" "}
                          {humanize(clip.communicative_function)}
                        </span>
                        <h3 lang="zh-Hans">{clip.transcript}</h3>
                        <p>
                          {clip.sentence_type === null
                            ? "Sentence type not reviewed"
                            : humanize(clip.sentence_type)}{" "}
                          · {clip.speaker_label ?? "Speaker not reviewed"}
                          {" · Confirmed"}
                        </p>
                      </div>
                      <Link href={`/clips/${clip.id}`} prefetch={false}>
                        View evidence
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </article>
                  );
                })
              )}
            </div>
          </section>
          <ResearchDetails sourceReferences={sourceReferences} />
        </>
      )}
    </main>
  );
}

function ResearchDetails({
  sourceReferences,
}: Readonly<{
  sourceReferences: readonly VideoSourceReference[];
}>) {
  return (
    <section className="explorer-research">
      <details className="source-details">
        <summary>
          <span>About corpus evidence</span>
          <small>Source references and review requirements</small>
        </summary>
        <section
          className="source-references"
          aria-labelledby="source-reference-title"
        >
          <div>
            <h2 id="source-reference-title">Video references</h2>
            <p>
              References are not corpus evidence until transcription, speaker
              background, regional origin, and annotation are reviewed.
            </p>
          </div>
          {sourceReferences.map((source) => (
            <a
              href={source.source_url}
              target="_blank"
              rel="noreferrer"
              key={source.id}
            >
              <span>
                {source.title ??
                  `YouTube reference ${source.id.replace("yt_", "")}`}
              </span>
              <small>
                Region{" "}
                {source.region_verification === "researcher_confirmed"
                  ? source.speaker_regions.join(", ")
                  : "unverified"}
              </small>
              <ExternalLink aria-hidden="true" />
            </a>
          ))}
        </section>
      </details>
      <details className="candidate-inventory">
        <summary>
          Extended candidate inventory
          <span>{EXTENDED_PARTICLE_CANDIDATES.length} forms and sequences</span>
        </summary>
        <p>
          These researcher-supplied candidates require orthographic,
          tokenization, and sentence-final-function validation before they
          become canonical FP tokens.
        </p>
        <div lang="zh-Hans">
          {EXTENDED_PARTICLE_CANDIDATES.map((candidate) => (
            <span key={candidate}>{candidate}</span>
          ))}
        </div>
      </details>
    </section>
  );
}

function uniqueByClip(
  clips: readonly ConfirmedExplorerClipListItem[],
): ConfirmedExplorerClipListItem[] {
  return Array.from(new Map(clips.map((clip) => [clip.id, clip])).values());
}

function uniqueClipCount(
  clips: readonly ConfirmedExplorerClipListItem[],
): number {
  return new Set(clips.map(({ id }) => id)).size;
}

function humanize(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
