# Final Particle Gesture Coder: Product Specification

## Purpose

Final Particle Gesture Coder helps semantic linguistics researchers analyze
how native Mandarin speakers create meaning by combining sentence-final
particles with tone, sentence type, discourse context, and gesture. It reduces
the manual work involved in transcription review, clip creation, forced
alignment, gesture coding, and semantic annotation.

The reviewed corpus can also support an educational experience for Mandarin
learners. A learner should be able to see how verbal and non-verbal cues work
together in authentic examples without confusing an automated suggestion with
a confirmed linguistic interpretation.

Its educational purpose is to help people recognize Mandarin sentence-final
particles as utterance-final emphasis and stance cues, then understand how
their interpretation changes with tone, sentence type, discourse context, and
visible gesture.

In this specification, **FP** means sentence-final particle. **Meaning** is a
context-sensitive communicative interpretation grounded in the hierarchical
organization of discourse, utterance, sentence, and clause. It must be
supported by the particle, tone, sentence type/context, and gesture evidence
rather than derived from the particle alone.

## Target particles

The controlled target inventory is:

| Pinyin | Canonical token | Accepted surface forms |
|---|---|---|
| ne | 呢 | 呢 |
| ba | 吧 | 吧 |
| ou | 哦 | 哦 |
| a | 啊 | 啊 |
| la | 啦 | 啦 |
| ya | 呀 | 呀 |
| ma | 吗 | 吗, 嗎 |

Traditional `嗎` is retained as the observed `surface_form` and normalized to
canonical `fp_token: "吗"` for querying.

### Extended researcher-supplied candidates

The following forms are retained as an extended candidate inventory:

```
了 的 嘛 罢了 而已 哇 哪 呕 哟 罢 呗 啵 咯 啰 喽 噢 喔

了吗 了吧 了呢 的吗 的吧 的呢 了啊 的啦 的嘛 的哦 了哦
吧啊 呢啊 吗啊 啦啊 呗啊 吧吗 呢吧 了啦 吧啦 呢啦 嘛啦 哦啦

了吗吧 了呢吧 了的吧 了吗呢 了吧呢 了呢吗 的了吗 了吧吗
的吗呢 的呢吗 了的吗 的了吧 的呢吧 了啊吧 了呢啊 了吗啊
了吧啊 的啦啊 的哦啊 了哦啊 吧了呢 吗了呢 呢了吧
```

`wa` now corresponds to the explicitly supplied candidate 哇. These
candidates are not automatically equivalent to the validated seven-token
inventory. Several can be lexical, aspectual, modal, orthographic variants, or
stacked sequences depending on context. `呕` in particular requires
orthographic review.

Before promotion to canonical `FP_token`, a researcher must validate spelling,
normalization, sentence-final position, tokenization, communicative function,
and pinyin. Candidate detection must use longest-suffix matching across aligned
intervals so `了吗吧` is not silently reduced to `吧`.

## Unit of analysis

One research project may contain multiple source videos. Each video keeps its
own transcript, participants, frame rate, source timeline, alignment manifest,
and processing status. Project-level queues and explorers aggregate records
across videos only after retaining that video identity.

One clip is a source-video interval containing at least one target particle.
Every target-particle occurrence inside the clip is a separate particle
instance, even when the clip contains more than one.

Canonical timing is stored as absolute integer milliseconds on the source
video. Frames are derived from the source frame rate:

```
frame = round(milliseconds / 1000 × fps)
```

This prevents timestamps and frames from drifting apart.

## Clip identification

Clip names are deterministic and human-readable:

```
{video_id}_{speaker_id}_{addressee_id}_{fp_pinyin}_{fp_start_ms}
```

Example:

```
vid03_spkA_spkB_ma_014310
```

The filename is a locator, not the authoritative annotation record. Exact
Chinese surface form, all particle instances, and corrected participant
identities remain structured metadata.

## Required clip annotations

### Clip-level

- clip ID and generated clip name
- source-video start and end milliseconds
- speaker
- addressee, including unknown or off-camera
- corrected utterance transcription
- discourse context
- sentence text
- clause boundaries and clause text
- sentence type
- tone contour
- `FP_count`, derived from the number of particle instances in the clip
- proposed communicative meaning or function
- evidence-based explanation for that proposed meaning
- human review status and provenance
- speaker and addressee regional-origin metadata with verification state

### Per particle instance

- stable particle instance ID
- exact observed `surface_form`
- normalized `FP_token`
- pinyin
- particle start and end milliseconds
- derived particle start and end frames
- gesture present or absent
- specific gesture type
- gesture region: face, body, or both
- gesture start and end milliseconds
- derived gesture start and end frames
- confidence, source, and human review decision for every suggestion

## Transcription and alignment

The transcription for every utterance must be corrected by a human before
forced alignment. Alignment must refuse unconfirmed transcripts. A transcript
revision invalidates older alignment output so stale word timings cannot enter
the corpus.

The corrected transcript provides evidence for particle detection and sentence
type. Video and audio provide evidence for gesture and tone. Participant
identity, addressee, discourse context, clause boundaries, and communicative
meaning remain human-reviewable.

## Gesture annotation

Computer vision may propose gesture presence, type, region, and boundaries.
These are draft annotations, not ground truth. Reviewers must be able to:

- play and scrub the clip
- step frame by frame
- adjust gesture start and end
- choose or correct the gesture taxonomy
- distinguish face, body, and combined gestures
- mark no gesture or uncertainty
- accept, edit, or skip a suggestion with provenance retained

## Meaning derivation

For each clip, the interface displays a simple, readable evidence equation:

```
final particle + tone + sentence type / context + gesture
  → proposed communicative meaning
```

Example structure:

```
吗 + soft/rising tone + polar-question context + raised eyebrows
  → confirmation seeking
```

The example is illustrative rather than a research finding. The software must
show which values are model suggestions, which were edited, and which were
confirmed by a researcher.

The communicative-function vocabulary should begin small and remain
researcher-extensible. Candidate values include confirmation seeking,
softening, suggestion, insistence, surprise, shared-context marking, emotional
emphasis, topic continuation, other, and uncertain.

## Research interface

### Multi-video ingest

- accepts one or more source videos in a project
- assigns or requires a unique stable `video_id` for each input
- reports transcript, alignment, gesture-analysis, and review status per video
- permits failed videos to be retried without rerunning completed videos
- never combines millisecond or frame coordinates across videos
- exposes project-wide counts only from the selected review states
- stores public reference URLs separately from downloaded or ingested media

### Video references and speaker origin

The initial external reference list includes:

- [YouTube reference `OvX0ccTNYDs`](https://www.youtube.com/watch?v=OvX0ccTNYDs)

Its title, speaker identities, native-language background, and regional origins
remain unverified. Before corpus ingest, the researcher records a stable speaker
ID, source-supported region, attribution evidence, and human confirmation.
Region must never be inferred solely from appearance, unsupported accent
impressions, or the video URL.

The machine-readable record is
[`docs/video-sources.json`](video-sources.json).

### Transcript review

- displays ASR utterances alongside the source media
- shows the exact observed FP token in bold in read-only presentation without
  storing formatting markers in the canonical transcript
- requires correction and explicit confirmation
- blocks alignment until every included utterance is confirmed

### Coding queue

- prioritizes clips needing human decisions
- filters by particle, sentence type, speaker, status, and confidence
- opens the detailed coding workspace

### Coding workspace

- video playback, scrubbing, and frame stepping
- particle and gesture timing tracks
- corrected transcript with the target particle highlighted
- review controls for speaker, addressee, particle, gesture, sentence type,
  tone, linguistic context, and meaning
- a metadata information panel containing speaker, addressee, their regional
  origin and verification state, final particle, particle start and end, clip
  start and end, `FP_count`, and sentence type
- explicit confirmation before a clip enters the reviewed corpus
- durable saving through a repository/data-file boundary rather than browser
  component state alone

### Clip explorer

The initial explorer view groups confirmed clips by final particle. Each
particle shows:

- the number of matching clips
- the communicative meanings observed with that particle
- the number of clips associated with each meaning

Selecting a particle filters the corpus to that particle. Selecting one of its
meanings further filters the results to clips creating that reviewed meaning.
Counts must be derived from actual reviewed records rather than hard-coded
examples.

### Clip detail and educational context

An individual clip view shows:

- playable source excerpt
- meaning equation
- discourse context
- corrected utterance
- sentence and clause segmentation
- reviewed metadata information panel
- clear separation between automated suggestions and confirmed annotations

Research controls and provenance remain visible to researchers. Learner-facing
language may explain the confirmed pairing in plainer terms while retaining
access to the original evidence.

## Research integrity

- Model output is always a suggestion until a person reviews it.
- Original suggestions remain stored after edits.
- `FP_count` is derived, not manually entered.
- All canonical timings use the source-video timeline.
- Clip and particle IDs remain stable across downstream processing.
- Demonstration fixtures are labeled and never presented as research results.
- Corpus counts and meaning labels include only the review states selected by
  the researcher.
- Participant region/dialect is unknown unless supported by researcher-supplied
  evidence and confirmation; never assert it from appearance or an unsupported
  accent impression.

## Delivery order

1. Accurate transcript review and stale-alignment protection
2. Multi-video project ingest plus per-video status and transcript isolation
3. Particle detection, timing, clip generation, and participant metadata
4. Gesture and tone suggestions with human correction
5. Sentence, discourse, utterance, and clause annotation
6. Reviewable communicative-function derivation and evidence equation
7. Particle/meaning explorer and learner-facing clip detail
