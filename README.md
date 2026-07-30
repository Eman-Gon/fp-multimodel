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
   - FP start/end frame
   - Gesture type
   - Gesture region (face / body / both)
   - Gesture start/end frame
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
- `(Clip)-[:CONTAINS_PARTICLE {start_frame, end_frame, count}]->(Particle)`
- `(Clip)-[:ACCOMPANIED_BY {start_frame, end_frame}]->(Gesture)`
- `(Clip)-[:CLASSIFIED_AS]->(SentenceType)`
