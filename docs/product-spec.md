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
canonical `fp_token: "吗"` for querying. “Wa” is not part of the declared
target inventory and must not be introduced without a separate research
decision.

## Unit of analysis

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

### Transcript review

- displays ASR utterances alongside the source media
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
- a metadata information panel containing speaker, addressee, final particle,
  particle start and end, clip start and end, `FP_count`, and sentence type
- explicit confirmation before a clip enters the reviewed corpus

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

## Delivery order

1. Accurate transcript review and stale-alignment protection
2. Particle detection, timing, clip generation, and participant metadata
3. Gesture and tone suggestions with human correction
4. Sentence, discourse, utterance, and clause annotation
5. Reviewable communicative-function derivation and evidence equation
6. Particle/meaning explorer and learner-facing clip detail
