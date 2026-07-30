# CLAUDE.md

Project instructions for **Final Particle Gesture Coder** — a research annotation tool for analyzing how native Mandarin speakers create meaning through gesture when using sentence-final particles (SFPs).

---

## Project Summary

Linguistics research assistants currently annotate gesture–particle data by hand in ELAN, frame by frame. This is slow and error-prone. This tool runs an AI first pass over video, pre-populates every coded field, and gives the researcher a fast review-and-correct interface. Confirmed data lands in a Neo4j graph that can be queried for co-occurrence patterns.

**Framing: AI drafts, humans confirm.** Never present AI output as ground truth. Every AI-generated field must be visually distinguishable from a human-confirmed one in the UI.

**Definitions:**

- **FP** means sentence-final particle.
- **Meaning** is a context-sensitive communicative interpretation grounded in
  the hierarchy of discourse, utterance, sentence, and clause together with
  particle, tone, sentence type, and gesture evidence. It is not inferred from
  the particle alone.

---

## Target Final Particles

| Pinyin | Simplified | Traditional |
|---|---|---|
| ne | 呢 | 呢 |
| ba | 吧 | 吧 |
| ou | 哦 | 哦 |
| a | 啊 | 啊 |
| la | 啦 | 啦 |
| ya | 呀 | 呀 |
| ma | 吗 | 嗎 |

**Normalization rule:** canonicalize to simplified on ingest. Store the original form in a `surface_form` field so nothing is lost.

The validated detector remains limited to the seven forms above. The
researcher-supplied extended candidate inventory lives in
`EXTENDED_PARTICLE_CANDIDATES`. Do not promote lexical/aspectual forms or
stacked sequences to canonical `FP_token` without explicit linguistic,
orthographic, pinyin, and tokenization review. Candidate sequence detection
must use longest-suffix matching across aligned intervals.

**Speaker region:** store region and attribution evidence as human-reviewable
speaker metadata. Never infer region from appearance or an unsupported accent
impression. Unknown/unverified is a valid and preferable state.

---

## Controlled Vocabularies

These are fixed enums. Never allow free text — downstream Cypher queries depend on exact matching.

### `gesture_type`
```
head_nod
head_shake
head_tilt
head_forward
head_back
eyebrow_raise
eyebrow_furrow
eye_widen
squint
smile
lip_purse
chin_thrust
shoulder_shrug
hand_flip          # palm rotation, often palm-up
hand_beat          # rhythmic stroke aligned to prosody
point
open_palm
lean_forward
lean_back
none               # explicitly no gesture detected
```

### `gesture_region`
```
face
body
both
```

### `sentence_type`
```
declarative
polar_question       # yes/no, typically 吗
content_question     # wh-question, often 呢
alternative_question
imperative
exclamative
```

### `tone_contour`
Categorical for v1. Do not attempt pitch-track modeling on day one.
```
rising
falling
level
falling_rising
rising_falling
```

### `clip_status`
```
draft         # AI-generated, unreviewed
in_review
confirmed     # human-verified
rejected      # false positive, excluded from corpus
```

---

## Critical Conventions

**Source of truth:** `docs/product-spec.md` defines product behavior,
`lib/vocab.ts` defines the TypeScript controlled vocabularies, and
`src/fp_multimodel/vocab.py` defines the Track A particle and sentence-type
subset. Keep shared values synchronized and update tests when a vocabulary
changes.

**Time is stored in milliseconds, always.** Frames are derived for display only. Source video arrives at varying FPS; normalize all input to **30 fps** on ingest with ffmpeg, and store `fps` on the `Video` node. Never store a raw frame number as the canonical value — mixed-FPS sources will silently corrupt alignment.

```
frame = round(ms / 1000 * fps)
```

**Clip boundaries:** clip window = `min(FP_start, gesture_start) - 1500ms` to `max(FP_end, gesture_end) + 1500ms`. Gestures routinely begin before the particle is uttered; a window anchored only on the particle will truncate them.

**Clip naming:**
```
{video_id}_{speaker_id}_{addressee_id}_{fp_token_pinyin}_{fp_start_ms}
e.g. vid03_spkA_spkB_ne_014230
```
Deterministic and collision-proof. Use pinyin, not characters, to keep filenames ASCII-safe.

**Multi-video projects:** a project may contain multiple source videos. Keep
each video's source timeline, frame rate, speaker namespace, transcript,
alignment artifacts, and processing state independent. Batch orchestration may
run videos concurrently, but every downstream artifact must retain `video_id`.

**Multi-particle clips:** a clip may contain more than one FP (`FP_count > 1`). Each particle instance gets its own `CONTAINS_PARTICLE` relationship, and each may pair with a different gesture. Do NOT model this as one gesture per clip.

---

## Pipeline

```
Raw video
  → normalize to 30fps, extract 16kHz mono WAV
  → [TRACK A] draft transcript (ASR)
  → [HUMAN CHECKPOINT 1] transcript correction
  → [TRACK A] forced alignment (MFA) → word-level timestamps
  → [TRACK A] FP detection at utterance-final position
  → [TRACK B] gesture detection in window around each FP
  → [TRACK B] speaker/addressee resolution, tone analysis
  → generate draft clips
  → [HUMAN CHECKPOINT 2] coding interface review
  → confirmed clip → Neo4j
  → graph explorer / insights / export
```

The two human checkpoints are the product. They exist because transcription accuracy and gesture classification are exactly where automation is unreliable.

---

# TRACK A — Transcription, Alignment, FP Detection

**Owns:** transcript accuracy, all timestamps, all FP fields, sentence/clause segmentation.

### A1. Audio extraction
```bash
ffmpeg -i input.mp4 -filter:v fps=30 normalized.mp4
ffmpeg -i normalized.mp4 -ac 1 -ar 16000 -vn audio.wav
```
MFA requires 16kHz mono WAV.

### A2. Draft transcription
Use a Mandarin-capable ASR (Whisper large-v3, or TwelveLabs speech output) to produce a draft transcript with rough utterance segmentation. **This is a draft only** — MFA's alignment is only as accurate as the transcript fed to it, so this output must go through human correction before alignment.

The runnable adapter invokes the external `openai-whisper` CLI with
`large-v3`, Mandarin (`zh`), and segment-level JSON output. It binds the run to
the verified A1 audio hash and source-video duration. Whisper's
`avg_logprob` is retained as a provider-native diagnostic; the review-priority
confidence is `exp(avg_logprob)` and that derivation is named in provenance.

The complete original ASR run is an immutable `asr_suggestion`, separate from
the editable `utterances` working copy. `source_segment_ids` keeps lineage when
a reviewer splits or merges rough ASR segments. A reviewed transcript must
never overwrite or delete its original suggestion.

Abbreviated output shape:
```json
{
  "video_id": "vid03",
  "transcript_origin": "asr",
  "asr_suggestion": {
    "schema_version": 1,
    "provenance": {
      "provider": "openai_whisper_cli",
      "model": "large-v3",
      "language": "zh",
      "task": "transcribe",
      "confidence_method": "exp_avg_logprob",
      "source_audio_sha256": "...",
      "provider_output_sha256": "..."
    },
    "segments": [
      {
        "id": "u000001",
        "provider_segment_id": "0",
        "start_ms": 12400,
        "end_ms": 15100,
        "surface_text": "你吃飯了嗎",
        "speaker": null,
        "confidence": 0.82,
        "diagnostics": [{"name": "avg_logprob", "value": -0.19845}]
      }
    ]
  },
  "utterances": [
    {
      "id": "u000001",
      "start_ms": 12400,
      "end_ms": 15100,
      "text": "你吃飯了吗",
      "surface_text": "你吃飯了嗎",
      "speaker": "spk_unknown",
      "confidence": 0.82,
      "source_segment_ids": ["u000001"],
      "transcript_confirmed": false
    }
  ]
}
```

### A3. Human checkpoint — transcript correction
Serve utterances to the Transcript Review page (Track C). Reviewer corrects characters, fixes segmentation, marks speaker. On submit, write corrected transcript to `.lab` files (one per utterance) alongside the WAV segments — MFA's expected input layout:

Review edits apply only to the working `utterances`. The frozen
`asr_suggestion` and its provider/audio provenance remain unchanged, and every
reviewed utterance retains one or more `source_segment_ids`.
```
corpus/
  spkA/
    u1.wav
    u1.lab      # corrected Chinese characters
```

### A4. Forced alignment
```bash
mfa model download acoustic mandarin_mfa
mfa model download dictionary mandarin_china_mfa
mfa align corpus/ mandarin_china_mfa mandarin_mfa output/
```
Produces TextGrid files with word- and phone-level start/end times.

Parse TextGrids with `praatio` (Python). Extract word tier intervals.

Note: the standard Mandarin model aligns **Chinese characters**, not pinyin. Transcripts must be in characters.

### A5. FP detection
Scan aligned word tiers for the seven target particles. A match counts as a final particle only if it is **utterance-final** — i.e. it is the last word interval in its utterance, or followed only by silence/punctuation. A 吗 mid-utterance is not an SFP.

Produce per instance:
```json
{
  "fp_token": "吗",
  "fp_pinyin": "ma",
  "surface_form": "嗎",
  "fp_start_ms": 14230,
  "fp_end_ms": 14480,
  "utterance_id": "u1"
}
```

### A6. Sentence type classification
Send the utterance text + FP token to OpenAI with the `sentence_type` enum in the prompt. Force JSON output constrained to the enum. Include a `confidence` field — the Coding Queue sorts by it.

### A7. Discourse structure segmentation
For the educational angle, segment and store four nesting levels:
```
Discourse  → the whole conversational exchange
Utterance  → a single speaker turn or intonation unit
Sentence   → syntactic sentence within an utterance
Clause     → clause within a sentence
```
Model as nodes with `CONTAINS` edges. Each FP attaches to the clause it terminates.

**Scope note:** if time is short, implement Utterance only and stub the other three levels. Do not let this block the core pipeline.

---

# TRACK B — Gesture, Speaker, Tone

**Owns:** all gesture fields, speaker/addressee resolution, tone.
**Depends on:** Track A timestamps to know which video windows to analyze.

### B1. Gesture detection window
For each FP instance, analyze video from `fp_start_ms - 2000` to `fp_end_ms + 2000`. Gesture strokes commonly precede the particle.

### B2. Two-model hybrid approach
No off-the-shelf co-speech gesture detector exists that generalizes across recording conditions. Use both models and reconcile:

**TwelveLabs Pegasus** — semantic gesture identification. Pegasus supports open vocabulary with structured JSON output, so pass the `gesture_type` enum directly as the taxonomy and require schema-compliant output with timestamps and confidence.

```
Prompt shape:
"Analyze the speaker between {start}ms and {end}ms. Identify any
communicative gesture. Respond ONLY with JSON matching:
{ gesture_type: <one of enum>, gesture_region: face|body|both,
  start_ms: int, end_ms: int, confidence: float }
Return gesture_type 'none' if no clear gesture occurs."
```

**MediaPipe Holistic** — frame-precise kinematics. Pose + face + hand landmarks at 30fps give exact motion onset/offset, which Pegasus's segment-level output cannot. Use velocity thresholding on relevant landmarks to find true gesture boundaries.

Reconciliation: **Pegasus decides WHAT the gesture is; MediaPipe decides WHEN it starts and ends.** Take the type/region from Pegasus, refine `gesture_start_ms`/`gesture_end_ms` using the nearest MediaPipe motion-onset and motion-offset within the Pegasus segment.

### B3. Multi-pass annotation design
Established gesture coding practice separates cognitive tasks: identifying that a gesture occurred is a different task from defining its boundaries. Mirror this in the data and the UI — emit gesture *presence* and gesture *boundaries* as separately confirmable fields, not one blob.

### B4. Speaker identification
Diarization from the audio (pyannote or ASR-provided speaker labels), cross-referenced with face tracking so a speaker ID maps to a visible person. Store a stable `speaker_id` per video.

### B5. Addressee resolution
Hardest field. Heuristic draft only, human confirms:
- Gaze direction from MediaPipe face landmarks
- Body/torso orientation from pose landmarks
- Conversational turn structure (who spoke immediately before/after)

Always emit low confidence here. Default the UI to requiring explicit human confirmation on this field.

### B6. Tone analysis
Extract F0 contour over the FP interval with `parselmouth` (Praat bindings). Classify into the `tone_contour` enum by fitting slope over the particle's duration.

Important: SFPs are phonologically neutral-tone and unstressed, so the measurable contour is carried by sentence intonation rather than lexical tone. Analyze the contour across the final clause plus particle, not the particle in isolation — measuring 250ms of an unstressed syllable alone will produce noise.

---

# TRACK C — Frontend

Next.js App Router. Frontend and API routes in one repo.

### Implemented routes
```
app/
├── page.tsx                          Product landing / workflow entry
├── queue/page.tsx                    Coding Queue
├── clips/[clipId]/page.tsx           Coding Interface (checkpoint 2)
├── explore/page.tsx                  Clip Explorer
└── api/
    ├── clips/[clipId]/route.ts        GET detail, PATCH review commands
    └── demo/reset/route.ts            POST reset demo fixtures
lib/
├── track-b/                         Provider-independent gesture pipeline
├── track-c/                         Demo repository + review state machine
├── vocab.ts                         TypeScript controlled vocabularies
└── types.ts                         Track A → Track B contracts
```

The transcript review, ingest/alignment, Neo4j graph, insights, and export
routes described below are planned work. Do not import or call them as if they
already exist.

### C1. Transcript Review page
- Utterance list, editable text field per utterance
- Target FPs highlighted inline in the draft text
- In read-only transcript presentation, render the exact observed FP token in
  bold without inserting formatting markers into the stored transcript
- Speaker assignment dropdown per utterance
- Addressee assignment and the final sentence containing the FP
- Low-confidence utterances flagged for attention
- "Approve & align" button → triggers `/api/align`

Make it clear in the UI that alignment quality depends on this step being correct.

### C2. Coding Interface — the core page
This is the highest-value build. Prioritize it.

Layout:
- **Video player**, clip-bounded, frame-step controls (`,` / `.` keys for ±1 frame)
- **Timeline strip** below the player showing two draggable marker pairs: FP window and gesture window. Dragging updates ms values.
- **Field panel** — one control per coded field:

| Field | Control |
|---|---|
| speaker | dropdown |
| addressee | dropdown (always requires explicit confirm) |
| fp_token | dropdown (7 particles) |
| fp_count | number, auto-filled |
| fp_start_ms / fp_end_ms | from timeline markers |
| gesture_present | toggle — confirm separately from type |
| gesture_type | dropdown from enum |
| gesture_region | face / body / both |
| gesture_start_ms / end_ms | from timeline markers |
| sentence_type | dropdown from enum |
| tone_contour | dropdown from enum |

- Each field shows provenance state: **AI suggested** (muted/italic) vs **confirmed** (solid). Editing a field auto-marks it confirmed.
- Confidence score displayed per AI-suggested field.
- Keyboard shortcuts for confirm/next — this is the difference between a demo and a tool an RA would actually use.
- "Confirm clip" only enables when all fields are confirmed or explicitly skipped.

### C3. Coding Queue
Filterable by `fp_token`, `sentence_type`, `speaker`, `clip_status`. **Default sort: ascending AI confidence** — lowest-confidence clips surface first, so human attention goes where the model is least sure.

### C4. Graph Explorer
`react-force-graph-2d`, fed from `/api/graph`. Color nodes by label. Click a
`Clip` node to jump to its Coding Interface page. The public endpoint exposes
only allowlisted, parameterized graph views over confirmed data; it never
accepts arbitrary Cypher. See `docs/neo4j-explorer.md` for the public,
researcher-MCP, and optional GraphRAG boundaries.

### C5. Insights
3–4 hardcoded Cypher queries surfaced as buttons. Do not build a free-text query box — it's slower to build and riskier in a live demo.

Export: CSV, plus **ELAN-compatible tier export** if time allows. ELAN is the incumbent tool in this field; interoperability with it is a meaningful credibility signal.

---

## Neo4j Data Model

The graph storage model and the public visualization projection are separate
contracts. Public API IDs must be stable domain IDs, never Neo4j internal node
or relationship IDs. In particular, a source-video-local speaker ID is stored
with the globally unique key `${video_id}:${speaker_id}` so repeated labels
such as `spkA` cannot merge speakers across videos.

### Constraints (run first)
```cypher
CREATE CONSTRAINT video_id IF NOT EXISTS FOR (v:Video) REQUIRE v.id IS UNIQUE;
CREATE CONSTRAINT clip_id IF NOT EXISTS FOR (c:Clip) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT speaker_key IF NOT EXISTS FOR (s:Speaker) REQUIRE s.key IS UNIQUE;
CREATE CONSTRAINT particle_token IF NOT EXISTS FOR (p:Particle) REQUIRE p.token IS UNIQUE;
CREATE CONSTRAINT stype_label IF NOT EXISTS FOR (st:SentenceType) REQUIRE st.label IS UNIQUE;
CREATE CONSTRAINT communicative_function_label IF NOT EXISTS
FOR (cf:CommunicativeFunction) REQUIRE cf.label IS UNIQUE;
```

### Nodes
```
Project(id, name)
Video(id, source, duration_ms, fps)
Utterance(id, text, start_ms, end_ms, transcript_confirmed: bool)
Clip(id, name, start_ms, end_ms, status, fp_count)
Speaker(key, id, video_id, label) # key = `${video_id}:${id}`
ParticipantBackground(participant_id, region, dialect, source, confirmed)
Particle(token, pinyin)
Gesture(type, region)          # canonical per type+region combo
SentenceType(label)
Tone(contour)
CommunicativeFunction(label)
```

### Relationships
```
(Project)-[:HAS_VIDEO]->(Video)
(Video)-[:HAS_UTTERANCE]->(Utterance)
(Video)-[:HAS_CLIP]->(Clip)
(Clip)-[:FROM_UTTERANCE]->(Utterance)
(Clip)-[:SPOKEN_BY]->(Speaker)
(Clip)-[:ADDRESSED_TO {confirmed: bool}]->(Speaker)
(Speaker)-[:HAS_BACKGROUND]->(ParticipantBackground)
(Clip)-[:CONTAINS_PARTICLE {
    instance_id, start_ms, end_ms, surface_form, confirmed
}]->(Particle)
(Clip)-[:ACCOMPANIED_BY {
    instance_id, start_ms, end_ms, confidence, source, confirmed
}]->(Gesture)
(Clip)-[:CLASSIFIED_AS {confidence, source, confirmed}]->(SentenceType)
(Clip)-[:HAS_TONE {confidence, source, confirmed}]->(Tone)
(Clip)-[:INTERPRETED_AS {
    suggested_label, suggested_evidence, confidence, source, confirmed,
    review_action, reviewer_id, reviewed_at, evidence
}]->(CommunicativeFunction)
```

`instance_id` links a specific particle occurrence to its paired gesture within a multi-particle clip.
`source` on `ACCOMPANIED_BY` records `pegasus` / `mediapipe` / `human`.
`INTERPRETED_AS` points to the current reviewed communicative function while
retaining the original model suggestion and evidence on the relationship.

The property lists above are abbreviated, but a `confirmed` boolean alone is
not sufficient provenance. Every graph-bound model suggestion must retain its
original value, source, confidence, current reviewed value, review action,
reviewer, and review timestamp after acceptance or editing. Skipped optional
values are omitted from the confirmed-corpus projection rather than replaced
with the model suggestion.

### Example insight query
```cypher
MATCH (c:Clip {status: 'confirmed'})-[cp:CONTAINS_PARTICLE]->(p:Particle {token: '呢'}),
      (c)-[cs:CLASSIFIED_AS]->(st:SentenceType {label: 'content_question'}),
      (c)-[ab:ACCOMPANIED_BY]->(g:Gesture)
WHERE cp.confirmed = true
  AND cs.confirmed = true
  AND ab.confirmed = true
  AND cp.instance_id = ab.instance_id
RETURN g.type, g.region, count(*) AS freq
ORDER BY freq DESC
```

Only ever aggregate over `status: 'confirmed'` clips and annotation
relationships whose values were confirmed. Draft data and unreviewed
relationship suggestions must never appear in an insight.

---

## Stack

| Layer | Tool |
|---|---|
| Video understanding | TwelveLabs (Marengo embeddings, Pegasus structured analysis) |
| Reasoning / classification | OpenAI |
| Pose & landmarks | MediaPipe Holistic |
| Forced alignment | Montreal Forced Aligner (`mandarin_mfa`) |
| Prosody | parselmouth (Praat) |
| Graph | Neo4j |
| Orchestration | Strands Agents |
| App | Next.js (App Router), TypeScript |
| Graph viz | react-force-graph-2d |

---

## Build Order

1. `lib/vocab.ts` + Neo4j constraints — everything depends on the enums
2. Track A through FP detection (A1–A5) — nothing downstream works without timestamps
3. Coding Interface (C2) with hand-seeded data — highest-value UI, build before the queue
4. Track B gesture detection (B1–B3) — plug real drafts into the working interface
5. Graph Explorer (C4)
6. Transcript Review (C1)
7. Insights + export (C5)
8. Addressee (B5), tone (B6), discourse levels (A7) — last, all are degradable

---

## Repository Workflow

The repository contains two tested runtimes:

- `src/fp_multimodel/`: Python 3.11+ Track A CLI and data contracts
- `app/`, `components/`, and `lib/`: Next.js/TypeScript Track B and Track C

Use the smallest relevant verification while iterating, then run the complete
suite before handing off a cross-cutting change:

```bash
uv sync
uv run pytest

npm install
npm test
npm run typecheck
npm run build
```

Do not commit generated state such as `.next/`, `node_modules/`, `.venv/`,
`__pycache__/`, `.pytest_cache/`, or `tsconfig.tsbuildinfo`.

When changing shared contracts:

1. Preserve `video_id`, `instance_id`, absolute source-video milliseconds, and
   suggestion provenance across every track boundary.
2. Keep original AI suggestions after human edits.
3. Treat `FP_count` as derived from particle instances.
4. Add or update both Python and TypeScript tests when behavior crosses the
   Track A/Track B boundary.
5. Persist production review work through a repository or data-file boundary;
   component state alone is not an annotation record. In-memory fixtures are
   acceptable only when clearly labeled as non-persistent demo data.

---

## Honesty Constraints

Do not let the tool or its output overstate what it establishes.

- The tool produces **annotation infrastructure**, not findings. A small corpus cannot support claims about gesture–particle correlation.
- No statistical claims without adequate n. Insight views should display raw counts, not percentages or significance.
- Inter-rater reliability is not implemented. The schema supports adding per-coder annotation edges later; say that rather than implying agreement has been measured.
- AI-suggested values are never silently promoted to confirmed. Confirmation requires a human action.
