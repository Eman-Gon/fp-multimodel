import { Info } from "lucide-react";
import type { ClipDetail, ReviewField } from "@/lib/track-c/types.ts";
import { sourceMillisecondsToFrame } from "./time.ts";

interface MeaningContextProps {
  readonly clip: ClipDetail;
  readonly particleInstanceId: string;
}

export function MeaningContext({
  clip,
  particleInstanceId,
}: MeaningContextProps) {
  const particle =
    clip.particle_instances.find(
      ({ instance_id }) => instance_id === particleInstanceId,
    ) ?? clip.particle_instances[0];
  if (particle === undefined) {
    return null;
  }

  const tokenValue = reviewedValue(particle.fields.fp_token);
  const token = tokenValue ?? "Skipped";
  const toneValue = reviewedValue(clip.fields.tone_contour);
  const sentenceTypeValue = reviewedValue(clip.fields.sentence_type);
  const gesturePresent = reviewedValue(particle.fields.gesture_present);
  const gestureType = reviewedValue(particle.fields.gesture_type);
  const meaningValue = reviewedValue(clip.fields.communicative_function);
  const fpTiming = reviewedValue(particle.fields.fp_timing);
  const gestureTiming = reviewedValue(particle.fields.gesture_timing);
  const speakerId = reviewedValue(clip.fields.speaker_id);
  const addresseeId = reviewedValue(clip.fields.addressee_id);
  const speaker = participant(clip, speakerId);
  const addressee = participant(clip, addresseeId);
  const tone = toneValue === null ? "Skipped" : humanize(toneValue);
  const sentenceType =
    sentenceTypeValue === null ? "Skipped" : humanize(sentenceTypeValue);
  const gesture =
    gesturePresent === false
      ? "No gesture"
      : gestureType === null
        ? "Skipped"
        : humanize(gestureType);
  const meaning =
    meaningValue === null ? "Skipped" : humanize(meaningValue);

  return (
    <section className="meaning-context" aria-labelledby="meaning-context-title">
      <header>
        <div>
          <h2 id="meaning-context-title">Meaning evidence</h2>
          <p>
            {clip.clip.status === "confirmed"
              ? "Human-reviewed interpretation; skipped evidence stays explicit."
              : "Proposed interpretation—confirm each component before use."}
          </p>
        </div>
        <details className="clip-info">
          <summary aria-label="Show clip information">
            <Info aria-hidden="true" />
            <span>Clip info</span>
          </summary>
          <dl>
            <InfoItem label="Video" value={clip.video.id} />
            <InfoItem label="Speaker" value={speaker.label} />
            <InfoItem
              label="Speaker region"
              value={
                speaker.id === "skipped"
                  ? "Skipped"
                  : formatRegion(
                      speaker.region,
                      speaker.region_source,
                      speaker.region_confirmed,
                    )
              }
            />
            <InfoItem
              label="Addressee"
              value={addressee.label}
            />
            <InfoItem
              label="Addressee region"
              value={
                addressee.id === "skipped"
                  ? "Skipped"
                  : formatRegion(
                      addressee.region,
                      addressee.region_source,
                      addressee.region_confirmed,
                    )
              }
            />
            <InfoItem
              label="Final particle"
              value={
                tokenValue === null
                  ? "Skipped"
                  : `${token} · ${particle.fp_pinyin}`
              }
            />
            <InfoItem
              label="FP time"
              value={formatRange(fpTiming)}
            />
            <InfoItem
              label="FP frames"
              value={formatFrames(fpTiming, clip.video.fps)}
            />
            <InfoItem
              label="Clip time"
              value={`${clip.clip.start_ms}–${clip.clip.end_ms} ms`}
            />
            <InfoItem
              label="Gesture frames"
              value={
                gesturePresent === false
                  ? "Not applicable"
                  : formatFrames(gestureTiming, clip.video.fps)
              }
            />
            <InfoItem
              label="FP count"
              value={String(
                reviewedValue(clip.fields.fp_count) ??
                  clip.particle_instances.length,
              )}
            />
            <InfoItem label="Sentence type" value={sentenceType} />
          </dl>
        </details>
      </header>

      <div className="meaning-equation" aria-label="Meaning evidence equation">
        <EvidenceTerm label="Particle" value={token} lang="zh-Hans" />
        <span aria-hidden="true">+</span>
        <EvidenceTerm label="Tone" value={tone} />
        <span aria-hidden="true">+</span>
        <EvidenceTerm label="Sentence type" value={sentenceType} />
        <span aria-hidden="true">+</span>
        <EvidenceTerm label="Gesture" value={gesture} />
        <span className="meaning-equation__arrow" aria-hidden="true">
          →
        </span>
        <EvidenceTerm
          label={
            clip.clip.status === "confirmed"
              ? "Reviewed meaning"
              : "Proposed meaning"
          }
          value={meaning}
          result
        />
      </div>

      <p className="meaning-context__explanation">
        {textValue(
          reviewedValue(clip.fields.meaning_explanation),
          "Meaning explanation skipped by reviewer.",
        )}
      </p>

      <div className="linguistic-context">
        <ContextItem
          label="Discourse"
          value={textValue(
            reviewedValue(clip.fields.discourse_context),
            "Skipped",
          )}
        />
        <ContextItem label="Utterance" value={clip.utterance.text} lang="zh-Hans" />
        <ContextItem
          label="Sentence"
          value={textValue(reviewedValue(clip.fields.sentence_text), "Skipped")}
          lang="zh-Hans"
        />
        <ContextItem
          label="Clauses"
          value={
            reviewedValue(clip.fields.clauses)?.join(" · ") ?? "Skipped"
          }
          lang="zh-Hans"
        />
      </div>
    </section>
  );
}

function EvidenceTerm({
  label,
  value,
  lang,
  result = false,
}: Readonly<{
  label: string;
  value: string;
  lang?: string;
  result?: boolean;
}>) {
  return (
    <div className={result ? "meaning-equation__result" : undefined}>
      <span>{label}</span>
      <strong lang={lang}>{value}</strong>
    </div>
  );
}

function ContextItem({
  label,
  value,
  lang,
}: Readonly<{ label: string; value: string; lang?: string }>) {
  return (
    <div>
      <span>{label}</span>
      <p lang={lang}>{value}</p>
    </div>
  );
}

function InfoItem({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function reviewedValue<T>(field: ReviewField<T>): T | null {
  if (field.state === "skipped") {
    return null;
  }
  return field.value ?? field.suggestion.value;
}

function participant(
  clip: ClipDetail,
  participantId: string | null,
): ClipDetail["participant_options"][number] {
  if (participantId === null) {
    return {
      id: "skipped",
      label: "Skipped",
      region: null,
      region_source: null,
      region_confirmed: false,
    };
  }
  return (
    clip.participant_options.find(({ id }) => id === participantId) ?? {
      id: participantId,
      label: participantId,
      region: null,
      region_source: null,
      region_confirmed: false,
    }
  );
}

function formatRange(
  range: { readonly start_ms: number; readonly end_ms: number } | null,
): string {
  return range === null
    ? "Skipped"
    : `${range.start_ms}–${range.end_ms} ms`;
}

function formatFrames(
  range: { readonly start_ms: number; readonly end_ms: number } | null,
  fps: number,
): string {
  return range === null
    ? "Skipped"
    : `${sourceMillisecondsToFrame(range.start_ms, fps)}–${sourceMillisecondsToFrame(range.end_ms, fps)}`;
}

function textValue(value: string | null, fallback: string): string {
  return value ?? fallback;
}

function formatRegion(
  region: string | null | undefined,
  source: string | null | undefined,
  confirmed: boolean,
): string {
  if (region == null) {
    return "Unknown · unverified";
  }
  const status = confirmed ? "confirmed" : "unverified";
  return source == null
    ? `${region} · ${status}`
    : `${region} · ${status} · ${source}`;
}

function humanize(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
