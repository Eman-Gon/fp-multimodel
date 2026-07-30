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
| AI Setup | Configure TwelveLabs, index videos, and request Pegasus drafts |
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
Each run writes an append-only, content-addressed sidecar containing the exact
raw provider JSON and original segment suggestions; reviewed transcripts remain
hash-bound to that sidecar.
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

# A2: run Mandarin Whisper. Keep --output beside audio.wav. This produces an
# append-only asr-suggestions/<sha256>.json sidecar plus an editable,
# unconfirmed utterance working copy.
uv run fp-track-a transcribe \
  work/vid03/audio.wav \
  --video-id vid03 \
  --output work/vid03/transcript.draft.json

# A3: copy the draft to transcript.reviewed.json; edit only utterances,
# preserve the suggestion digest and source_segment_ids, add a SpeakerProfile,
# then add transcript_review (accept/edit, reviewer, timestamp, artifact digest)
# and transcript_confirmed=true to every included utterance.
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
Corpus/alignment manifests are schema version 2; regenerate older Track A
artifacts because the transcript hash now includes A2 and review provenance.

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

### TwelveLabs setup

The concrete integration uses the TwelveLabs v1.3 asset, indexed-asset, and
Pegasus 1.5 analysis APIs. Configure its server-only credential locally:

```bash
cp .env.example .env.local
# Edit .env.local:
TWELVELABS_API_KEY=your-server-side-key
```

Never use a `NEXT_PUBLIC_` variable for this key. The status route returns only
configuration metadata:

```http
GET /api/integrations/twelvelabs/status
```

```json
{
  "data": {
    "provider": "twelvelabs",
    "configured": true,
    "api_version": "v1.3",
    "model": "pegasus1.5",
    "capabilities": {
      "direct_upload": true,
      "indexing": true,
      "structured_gesture_analysis": true
    }
  }
}
```

The browser workflow is available at `/integrations/twelvelabs`. It indexes
registered source videos only, so an upload cannot become an analysis dead end
without a retained particle instance.

### Index a video

Indexing is an explicit asynchronous sequence. Keep the returned `asset_id`
and `indexed_asset_id`; neither replaces the research `video_id`.

1. Upload a public URL:

   ```json
   {
     "action": "upload",
     "video_id": "vid03",
     "index_id": "your-twelvelabs-index-id",
     "video_url": "https://media.example/source.mp4"
   }
   ```

2. While the response is `stage: "upload", status: "processing"`, poll with:

   ```json
   {
     "action": "status",
     "video_id": "vid03",
     "index_id": "your-twelvelabs-index-id",
     "asset_id": "asset-123"
   }
   ```

3. When the upload is `ready`, start indexing:

   ```json
   {
     "action": "index",
     "video_id": "vid03",
     "index_id": "your-twelvelabs-index-id",
     "asset_id": "asset-123"
   }
   ```

4. Poll the indexed asset until terminal:

   ```json
   {
     "action": "status",
     "video_id": "vid03",
     "index_id": "your-twelvelabs-index-id",
     "asset_id": "asset-123",
     "indexed_asset_id": "indexed-456"
   }
   ```

`POST /api/integrations/twelvelabs/index` returns `202` with
`status: "processing"` for provider `pending`, `queued`, or `indexing` states.
It returns `200` for terminal `ready` or `failed` states:

```json
{
  "data": {
    "provider": "twelvelabs",
    "video_id": "vid03",
    "index_id": "your-twelvelabs-index-id",
    "asset_id": "asset-123",
    "indexed_asset_id": "indexed-456",
    "stage": "index",
    "status": "ready"
  }
}
```

Multipart upload is also supported with `video_id`, `index_id`, and
`video_file` fields.

### Analyze one particle

Analysis accepts one complete Track A particle. IDs and all canonical times are
validated before any provider call. Times are non-negative absolute integer
milliseconds on the source-video timeline. The matching TwelveLabs asset must
be `ready`; analysis returns `409` with `retryable: true` while it is still
processing and `retryable: false` after a terminal upload failure:

```json
{
  "video_id": "vid03",
  "instance_id": "vid03:u17",
  "asset_id": "asset-123",
  "video_duration_ms": 183000,
  "particle": {
    "instance_id": "vid03:u17",
    "fp_token": "吗",
    "fp_pinyin": "ma",
    "surface_form": "嗎",
    "fp_start_ms": 14310,
    "fp_end_ms": 14560,
    "utterance_id": "u17",
    "source": "mfa_rule",
    "confidence": 0.82,
    "confirmed": false
  }
}
```

The setup page replays the immutable Track A token and timing suggestions.
Skipped inputs are excluded, and the retained source-video timing is read-only
so a reviewed or ad hoc value is never relabeled as an MFA suggestion.

`POST /api/integrations/twelvelabs/analyze` returns the same `video_id`,
`instance_id`, and `asset_id` with an unconfirmed `GestureAnnotationDraft`.
Every AI field has `confirmed: false`. `model_evidence.pegasus` retains the
original parsed suggestion, while `model_evidence.provider` retains the model,
asset, provider window, response ID, finish reason, and an allowlisted original
structured-response envelope. Arbitrary provider diagnostics and server
credentials are never returned.

### Retry and human review

Errors use this envelope:

```json
{
  "error": {
    "code": "TWELVELABS_RATE_LIMITED",
    "message": "TwelveLabs rate-limited the request. Try again later.",
    "details": {
      "retryable": true,
      "video_id": "vid03",
      "instance_id": "vid03:u17"
    }
  }
}
```

Retry transport failures, timeouts, rate limits, and provider 5xx failures only
when `details.retryable` is `true`. Resume polling with the saved provider IDs;
do not repeat a completed upload or indexing action, because provider creation
requests are not assumed to be idempotent. A failed video can be retried
without rerunning completed videos. These are API-level recovery rules: the
setup page's **Start indexing** action begins a new upload and does not resume a
timed-out run. Before starting again, recover the saved IDs from the API caller
or provider console and poll the explicit `status` action, or verify that the
previous provider operation is terminal.

A successful analysis is still only an AI suggestion. It does not confirm a
clip or enter corpus counts automatically. The setup page displays the draft
but does not persist or confirm it. Import drafts through the
optimistic-versioned Track B clip endpoint, then require a researcher to
accept, edit, or skip each field in the coding workspace. The original Pegasus
suggestion and provider provenance remain stored after review; only explicit
human confirmation can make the clip eligible for confirmed-corpus insights.

The batched Python MediaPipe worker remains a next integration step. Provider
calls stay behind small interfaces, so tests require neither credentials nor
heavyweight CV dependencies.

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
npm run build
```
