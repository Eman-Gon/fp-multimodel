"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUp, Filter, Play } from "lucide-react";
import {
  CLIP_STATUSES,
  SENTENCE_TYPES,
  TARGET_PARTICLES,
} from "@/lib/vocab.ts";
import { DEMO_CLIP_ID } from "@/lib/track-c/seed.ts";

const QUEUE_ITEM = {
  id: DEMO_CLIP_ID,
  transcript: "你不是已经吃过了吗",
  particle: "吗",
  sentenceType: "polar_question",
  speakerId: "spkA",
  speaker: "Speaker A",
  status: "in_review",
  confidence: 0.61,
  duration: "7.2 s",
} as const;

export function QueuePage() {
  const [particleFilter, setParticleFilter] = useState("");
  const [sentenceFilter, setSentenceFilter] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const matchesFilters =
    (particleFilter === "" || particleFilter === QUEUE_ITEM.particle) &&
    (sentenceFilter === "" ||
      sentenceFilter === QUEUE_ITEM.sentenceType) &&
    (speakerFilter === "" || speakerFilter === QUEUE_ITEM.speakerId) &&
    (statusFilter === "" || statusFilter === QUEUE_ITEM.status);

  return (
    <main className="queue-page">
      <header className="queue-header">
        <div>
          <h1>Coding queue</h1>
          <p>
            Review the least-certain draft first. Only human-confirmed clips
            leave this queue.
          </p>
        </div>
        <Link
          href={`/clips/${DEMO_CLIP_ID}`}
          className="button button--primary queue-header__action"
        >
          Continue review
        </Link>
      </header>

      <section className="queue-filters" aria-label="Queue filters">
        <div className="queue-filters__label">
          <Filter aria-hidden="true" />
          <span>Filters</span>
        </div>
        <label>
          <span>Particle</span>
          <select
            value={particleFilter}
            onChange={(event) => setParticleFilter(event.currentTarget.value)}
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
            onChange={(event) => setSentenceFilter(event.currentTarget.value)}
          >
            <option value="">All sentence types</option>
            {SENTENCE_TYPES.map((sentenceType) => (
              <option value={sentenceType} key={sentenceType}>
                {sentenceType}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Speaker</span>
          <select
            value={speakerFilter}
            onChange={(event) => setSpeakerFilter(event.currentTarget.value)}
          >
            <option value="">All speakers</option>
            <option value="spkA">Speaker A</option>
            <option value="spkB">Speaker B</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value)}
          >
            <option value="">All statuses</option>
            {CLIP_STATUSES.map((status) => (
              <option value={status} key={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="queue-table-wrap" aria-labelledby="queue-table-title">
        <div className="queue-table__caption">
          <div>
            <h2 id="queue-table-title">Needs attention</h2>
            <p>{matchesFilters ? "1 seeded review item" : "0 review items"}</p>
          </div>
          <span>
            <ArrowUp aria-hidden="true" />
            AI confidence
          </span>
        </div>
        <table className="queue-table">
          <thead>
            <tr>
              <th scope="col">Clip</th>
              <th scope="col">Particle</th>
              <th scope="col">Sentence type</th>
              <th scope="col">Speaker</th>
              <th scope="col">Status</th>
              <th scope="col">Lowest confidence</th>
              <th scope="col">
                <span className="visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {matchesFilters ? (
              <tr>
                <td>
                  <strong>{QUEUE_ITEM.transcript}</strong>
                  <span>
                    {QUEUE_ITEM.id} · {QUEUE_ITEM.duration}
                  </span>
                </td>
                <td lang="zh-Hans">{QUEUE_ITEM.particle}</td>
                <td>{QUEUE_ITEM.sentenceType}</td>
                <td>{QUEUE_ITEM.speaker}</td>
                <td>
                  <span className="queue-status">{QUEUE_ITEM.status}</span>
                </td>
                <td>
                  <span className="confidence-value">
                    {Math.round(QUEUE_ITEM.confidence * 100)}%
                  </span>
                  <small>Addressee</small>
                </td>
                <td>
                  <Link
                    href={`/clips/${QUEUE_ITEM.id}`}
                    className="queue-open"
                    aria-label={`Review ${QUEUE_ITEM.id}`}
                  >
                    <Play aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={7} className="queue-empty">
                  No seeded clips match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="queue-honesty">
        This fixture demonstrates annotation infrastructure. It is not a
        linguistic finding or a measure of model accuracy.
      </p>
    </main>
  );
}
