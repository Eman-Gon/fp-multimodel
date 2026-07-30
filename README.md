# Final Particle Gesture Coder

A research tool for analyzing how native Mandarin speakers use **gesture and tone** alongside sentence-final particles (呢, 吧, 哦, 啊, 啦, 呀, 嗎/吗) to create meaning — and for helping linguistics research assistants code that data faster.

## What it does

Given one or more raw videos of native Mandarin speakers, the tool:

1. Transcribes speech and detects sentence-final particle (FP) mentions
2. Force-aligns the transcript to get precise timestamps
3. Detects and classifies accompanying gestures (type, region, timing)
4. Classifies sentence type (question, statement, command, etc.)
5. Generates short clips around each FP mention, pre-coded with:
   - Speaker
   - Addressee
   - FP_token (the exact particle)
   - FP_count (particles in the clip)
   - FP start/end time (milliseconds; frames are derived for display)
   - Gesture type
   - Gesture region (face / body / both)
   - Gesture start/end time (milliseconds; frames are derived for display)
   - Sentence type

Every project may contain multiple source videos. Video IDs, source timelines,
speaker namespaces, transcripts, alignment artifacts, and particle instances
remain separate while the Coding Queue and Clip Explorer provide corpus-wide
views across the project.

The project may retain public video references before ingest. The current
reference registry includes
[`https://www.youtube.com/watch?v=OvX0ccTNYDs`](https://www.youtube.com/watch?v=OvX0ccTNYDs);
its title, speaker identities, and regional origins remain explicitly
unverified.

A human researcher reviews and corrects the AI's draft coding — transcription and gesture classification are the two places automation is least reliable, so those are built as checkpoints, not black boxes.

## Meaning analysis

The research unit is not the particle by itself. Each reviewed clip brings four
evidence streams together:

```
final particle + tone + sentence type / context + gesture
  → proposed communicative meaning
```

The proposed meaning and its explanation remain reviewable annotations. The
software must show the evidence it used instead of presenting an automated
interpretation as an established linguistic fact.

Each clip also retains its discourse context, corrected utterance, sentence,
and clause boundaries. This supports both semantic analysis and a later
learner-facing view that explains how verbal and non-verbal cues coalesce.

The original seven particles remain the validated detector vocabulary. A
larger researcher-supplied list of single forms and stacked sequences is stored
as an extended candidate inventory pending orthographic, tokenization, pinyin,
and linguistic-function review.

The complete product and annotation requirements are recorded in
[`docs/product-spec.md`](docs/product-spec.md).
The graph-access, MCP, and optional GraphRAG boundaries are recorded in
[`docs/neo4j-explorer.md`](docs/neo4j-explorer.md).

## Why

Manually coding gesture-particle data from video is slow and tedious for research assistants. This tool turns that into a fast review-and-confirm workflow instead of a from-scratch annotation task, then stores the confirmed data as a queryable graph.

## Pipeline

```
Raw video
  → Draft transcript (ASR)
  → Human review: transcript correction
  → Forced alignment (FP timestamps)
  → CV gesture detection (draft)
  → Human review: gesture + metadata coding
  → Confirmed clip → Neo4j
  → Graph Explorer / Insights
```

## Stack

- **TwelveLabs** — video understanding (speech, vision, on-screen content)
- **OpenAI** — reasoning/classification (sentence type, gesture disambiguation)
- **Neo4j** — graph storage of clips, particles, gestures, speakers, and their relationships
- **Strands Agents** — pipeline orchestration
- **Next.js** — frontend + backend (App Router, API routes)

## Pages

| Page | Purpose |
|---|---|
| Upload | Ingest raw video, trigger pipeline |
| Transcript Review | Correct draft transcript before alignment |
| Coding Queue | Clips awaiting review |
| Coding Interface | Video scrub + correct/confirm gesture & metadata fields |
| Clip Explorer | Browse confirmed clips grouped by particle and communicative meaning |
| Clip Detail | View the meaning equation, linguistic context, and reviewed clip metadata |
| Graph Explorer | Visualize the coded corpus as a graph |
| Insights | Query confirmed data (e.g. gesture frequency by particle) |

## Data model (Neo4j)

**Nodes:** `Video`, `Utterance`, `Clip`, `Speaker`, `Particle`, `Gesture`,
`SentenceType`, `Tone`, `CommunicativeFunction`

**Relationships:**
- `(Clip)-[:SPOKEN_BY]->(Speaker)`
- `(Clip)-[:ADDRESSED_TO]->(Speaker)`
- `(Clip)-[:CONTAINS_PARTICLE {start_ms, end_ms, count}]->(Particle)`
- `(Clip)-[:ACCOMPANIED_BY {start_ms, end_ms}]->(Gesture)`
- `(Clip)-[:CLASSIFIED_AS]->(SentenceType)`
- `(Clip)-[:HAS_TONE]->(Tone)`
- `(Clip)-[:INTERPRETED_AS]->(CommunicativeFunction)`

The browser graph uses stable domain IDs and a confirmed-only API projection;
it never receives Neo4j credentials or arbitrary Cypher access. The in-memory
fixture graph is a separate, visibly labeled demo mode.

## Track A foundation

The first runnable vertical slice lives in the Python package under
`src/fp_multimodel`. It currently covers:

- verified, video-scoped 30 fps normalization and 16 kHz mono WAV extraction,
  with source duration and SHA-256 provenance
- a concrete Mandarin `openai-whisper` CLI adapter using `large-v3`, with
  deterministic utterance IDs and source-timeline millisecond segments
- an immutable original ASR suggestion plus provider/model/audio provenance,
  kept separate from the editable transcript
- strict JSON contracts for draft/reviewed utterances
- an enforced human transcript checkpoint before alignment
- MFA corpus preparation (`.wav` + corrected Chinese `.lab` per utterance)
- Mandarin MFA model download/alignment command wrappers
- `praatio` parsing of MFA word-tier TextGrids
- utterance-final detection of 呢, 吧, 哦, 啊, 啦, 呀, and 吗/嗎
- longest-suffix detection of the extended researcher inventory as
  review-required candidates, without promoting them to canonical particles
- traditional `嗎` → simplified `吗` normalization while retaining
  `surface_form`
- deterministic `instance_id` values for the Track B handoff
- explicit `source`, nullable confidence, and `confirmed: false` provenance on
  every rule-derived particle
- conversion of segment-local MFA timings back to source-video milliseconds
- revision manifests that reject stale or cross-video TextGrids after a
  transcript correction
- a versioned Track A→B artifact carrying video duration, media/transcript
  hashes, MFA model identity, canonical particles, and review-only candidates
- validated multi-video transcript batches with unique video identities
- human-reviewable discourse, sentence, and clause context on each utterance

The Whisper adapter is implemented behind the provider-neutral A2 boundary.
Sentence-type classification (A6) and nested discourse structure (A7) remain
next increments. `examples/transcript.draft.json` demonstrates the persisted
suggestion/working-copy contract.

### Setup

Python 3.11+, `uv`, and ffmpeg are required. The external `openai-whisper`
command is required for A2 and must be available as `whisper` on `PATH`.
Montreal Forced Aligner is required for alignment and must be available as
`mfa`.

```bash
uv sync
uv run fp-track-a --help
uv run pytest
```

### Run A1–A5

```bash
# A1: verified normalized.mp4 (30 fps), audio.wav (16 kHz mono), and a
# video-scoped media-manifest.json.
uv run fp-track-a normalize input.mp4 \
  --video-id vid03 \
  --output-dir work/vid03

# A2: run Mandarin Whisper. This produces a frozen original suggestion and an
# editable, unconfirmed utterance working copy.
uv run fp-track-a transcribe \
  work/vid03/audio.wav \
  --video-id vid03 \
  --output work/vid03/transcript.draft.json

# A3: copy the draft to transcript.reviewed.json; edit only utterances,
# preserve asr_suggestion/source_segment_ids, and explicitly set
# transcript_confirmed=true on every included utterance.
uv run fp-track-a validate-transcript work/vid03/transcript.reviewed.json

# A3: this command refuses unconfirmed transcripts.
uv run fp-track-a prepare-corpus \
  work/vid03/transcript.reviewed.json \
  work/vid03/audio.wav \
  --output-dir work/vid03/corpus

# A4: one-time model download, then forced alignment.
uv run fp-track-a download-mfa-models
uv run fp-track-a align \
  work/vid03/corpus \
  --output-dir work/vid03/aligned

# A5: parse TextGrids and emit source-timeline particle instances.
uv run fp-track-a detect-fps \
  work/vid03/transcript.reviewed.json \
  work/vid03/aligned \
  --output work/vid03/particles.json
```

All canonical times are integer milliseconds. Frame numbers remain derived UI
values (`round(ms / 1000 * fps)`) and are never persisted by Track A.

## Track B foundation

The provider-independent B1–B3 core lives in `lib/track-b`. It currently:

- adapts Track A particle JSON while preserving each emitted `instance_id`
- creates source-bounded analysis windows at FP start −2000ms through FP end
  +2000ms
- builds and strictly validates Pegasus structured-output prompts using the
  controlled gesture taxonomy
- turns MediaPipe landmark-velocity samples into motion intervals
- keeps Pegasus gesture type/region while refining timing from the nearest
  coherent MediaPipe interval whose boundaries fall within the Pegasus segment
- emits gesture presence and gesture boundaries as separate, unconfirmed draft
  fields with explicit confidence and provenance
- retains `video_id` plus original Pegasus and MediaPipe evidence on every
  reconciled draft
- merges complete per-instance drafts into an existing Track C clip shell
  without overwriting clip, transcript, participant, or meaning metadata
- persists those imports through an optimistic-versioned repository/API
  boundary so stale Track B jobs cannot overwrite newer human review
- preserves literal no-gesture suggestions (`null` region and boundaries) and
  the full original Track B evidence throughout later human review
- handles every FP instance independently for multi-particle videos
- analyzes multiple videos concurrently without mixing source timelines
- returns completed or failed status per video so failed provider calls can be
  retried without rerunning completed videos

The concrete TwelveLabs client and batched Python MediaPipe worker are the next
integration step. The core uses small provider interfaces so API credentials
and heavyweight CV dependencies are not required by its test suite.

## Track C foundation

The review interface now includes:

- a coding queue spanning multiple source videos
- video, particle, sentence-type, speaker, and status filters
- deterministic names containing video, speaker, addressee, particle, and time
- reviewable discourse, sentence, clause, communicative-function, and meaning
  explanation fields
- a visible particle + tone + sentence type + gesture meaning equation
- a clip information panel with canonical times and derived frame numbers
- a Clip Explorer grouped by particle and communicative function
- a colorful force-directed Graph Explorer with demo and confirmed-corpus
  scopes, semantic filters, search, neighborhood highlighting, and an evidence
  inspector

```bash
npm install
npm test
npm run typecheck
```
