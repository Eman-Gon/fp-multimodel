# Final Particle Gesture Coder

A research tool for analyzing how native Mandarin speakers use **gesture and tone** alongside sentence-final particles (呢, 吧, 哦, 啊, 啦, 呀, 嗎/吗) to create meaning — and for helping linguistics research assistants code that data faster.

## What it does

Given raw video of native Mandarin speakers, the tool:

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

A human researcher reviews and corrects the AI's draft coding — transcription and gesture classification are the two places automation is least reliable, so those are built as checkpoints, not black boxes.

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
| Graph Explorer | Visualize the coded corpus as a graph |
| Insights | Query confirmed data (e.g. gesture frequency by particle) |

## Data model (Neo4j)

**Nodes:** `Video`, `Clip`, `Speaker`, `Particle`, `Gesture`, `SentenceType`

**Relationships:**
- `(Clip)-[:SPOKEN_BY]->(Speaker)`
- `(Clip)-[:ADDRESSED_TO]->(Speaker)`
- `(Clip)-[:CONTAINS_PARTICLE {start_ms, end_ms, count}]->(Particle)`
- `(Clip)-[:ACCOMPANIED_BY {start_ms, end_ms}]->(Gesture)`
- `(Clip)-[:CLASSIFIED_AS]->(SentenceType)`

## Track A foundation

The first runnable vertical slice lives in the Python package under
`src/fp_multimodel`. It currently covers:

- 30 fps video normalization and 16 kHz mono WAV extraction
- strict JSON contracts for draft/reviewed utterances
- an enforced human transcript checkpoint before alignment
- MFA corpus preparation (`.wav` + corrected Chinese `.lab` per utterance)
- Mandarin MFA model download/alignment command wrappers
- `praatio` parsing of MFA word-tier TextGrids
- utterance-final detection of 呢, 吧, 哦, 啊, 啦, 呀, and 吗/嗎
- traditional `嗎` → simplified `吗` normalization while retaining
  `surface_form`
- deterministic `instance_id` values for the Track B handoff
- conversion of segment-local MFA timings back to source-video milliseconds

ASR provider integration (A2), sentence-type classification (A6), and nested
discourse structure (A7) are the next Track A increments. Until the ASR adapter
is connected, `examples/transcript.draft.json` demonstrates its required
output contract.

### Setup

Python 3.11+, `uv`, and ffmpeg are required. Montreal Forced Aligner is also
required for the alignment commands and must be available as `mfa` on `PATH`.

```bash
uv sync
uv run fp-track-a --help
uv run pytest
```

### Run A1–A5

```bash
# A1: normalized.mp4 (30 fps) + audio.wav (16 kHz mono)
uv run fp-track-a normalize input.mp4 --output-dir work/vid03

# A2/A3: validate the ASR JSON, then human-correct it and explicitly set
# transcript_confirmed=true on every reviewed utterance.
uv run fp-track-a validate-transcript examples/transcript.draft.json

# A3: this command refuses unconfirmed transcripts.
uv run fp-track-a prepare-corpus \
  examples/transcript.reviewed.json \
  work/vid03/audio.wav \
  --output-dir work/vid03/corpus

# A4: one-time model download, then forced alignment.
uv run fp-track-a download-mfa-models
uv run fp-track-a align \
  work/vid03/corpus \
  --output-dir work/vid03/aligned

# A5: parse TextGrids and emit source-timeline particle instances.
uv run fp-track-a detect-fps \
  examples/transcript.reviewed.json \
  work/vid03/aligned \
  --output work/vid03/particles.json
```

All canonical times are integer milliseconds. Frame numbers remain derived UI
values (`round(ms / 1000 * fps)`) and are never persisted by Track A.
