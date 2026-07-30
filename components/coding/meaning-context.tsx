import { Info } from "lucide-react";
import type { ClipDetail, ReviewField } from "@/lib/track-c/types.ts";
import { sourceMillisecondsToFrame } from "./time.ts";

interface MeaningContextProps {
  readonly clip: ClipDetail;
}

export function MeaningContext({ clip }: MeaningContextProps) {
  const particle = clip.particle_instances[0];
  if (particle === undefined) {
    return null;
  }

  const token = currentValue(particle.fields.fp_token);
  const tone = currentValue(clip.fields.tone_contour);
  const sentenceType = currentValue(clip.fields.sentence_type);
  const gesture = currentValue(particle.fields.gesture_type);
  const meaning = currentValue(clip.fields.communicative_function);
  const fpTiming = currentValue(particle.fields.fp_timing);
  const gestureTiming = currentValue(particle.fields.gesture_timing);
  const speakerId = currentValue(clip.fields.speaker_id);
  const addresseeId = currentValue(clip.fields.addressee_id);
  const speaker = participant(clip, speakerId);
  const addressee = participant(clip, addresseeId);

  return (
    <section className="meaning-context" aria-labelledby="meaning-context-title">
      <header>
        <div>
          <h2 id="meaning-context-title">Meaning evidence</h2>
          <p>Proposed interpretation—confirm each component before use.</p>
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
              value={formatRegion(speaker.region, speaker.region_confirmed)}
            />
            <InfoItem
              label="Addressee"
              value={addressee.label}
            />
            <InfoItem
              label="Addressee region"
              value={formatRegion(addressee.region, addressee.region_confirmed)}
            />
            <InfoItem label="Final particle" value={`${token} · ${particle.fp_pinyin}`} />
            <InfoItem
              label="FP time"
              value={`${fpTiming.start_ms}–${fpTiming.end_ms} ms`}
            />
            <InfoItem
              label="FP frames"
              value={`${sourceMillisecondsToFrame(fpTiming.start_ms, clip.video.fps)}–${sourceMillisecondsToFrame(fpTiming.end_ms, clip.video.fps)}`}
            />
            <InfoItem
              label="Clip time"
              value={`${clip.clip.start_ms}–${clip.clip.end_ms} ms`}
            />
            <InfoItem
              label="Gesture frames"
              value={`${sourceMillisecondsToFrame(gestureTiming.start_ms, clip.video.fps)}–${sourceMillisecondsToFrame(gestureTiming.end_ms, clip.video.fps)}`}
            />
            <InfoItem label="FP count" value={String(currentValue(clip.fields.fp_count))} />
            <InfoItem label="Sentence type" value={humanize(sentenceType)} />
          </dl>
        </details>
      </header>

      <div className="meaning-equation" aria-label="Meaning evidence equation">
        <EvidenceTerm label="Particle" value={token} lang="zh-Hans" />
        <span aria-hidden="true">+</span>
        <EvidenceTerm label="Tone" value={humanize(tone)} />
        <span aria-hidden="true">+</span>
        <EvidenceTerm label="Sentence type" value={humanize(sentenceType)} />
        <span aria-hidden="true">+</span>
        <EvidenceTerm label="Gesture" value={humanize(gesture)} />
        <span className="meaning-equation__arrow" aria-hidden="true">
          →
        </span>
        <EvidenceTerm label="Proposed meaning" value={humanize(meaning)} result />
      </div>

      <p className="meaning-context__explanation">
        {currentValue(clip.fields.meaning_explanation)}
      </p>

      <div className="linguistic-context">
        <ContextItem
          label="Discourse"
          value={currentValue(clip.fields.discourse_context)}
        />
        <ContextItem label="Utterance" value={clip.utterance.text} lang="zh-Hans" />
        <ContextItem
          label="Sentence"
          value={currentValue(clip.fields.sentence_text)}
          lang="zh-Hans"
        />
        <ContextItem
          label="Clauses"
          value={currentValue(clip.fields.clauses).join(" · ")}
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

function currentValue<T>(field: ReviewField<T>): T {
  return field.value ?? field.suggestion.value;
}

function participant(
  clip: ClipDetail,
  participantId: string,
): ClipDetail["participant_options"][number] {
  return (
    clip.participant_options.find(({ id }) => id === participantId) ?? {
      id: participantId,
      label: participantId,
      region: null,
      region_confirmed: false,
    }
  );
}

function formatRegion(region: string | null, confirmed: boolean): string {
  if (region === null) {
    return "Unknown · unverified";
  }
  return confirmed ? `${region} · confirmed` : `${region} · unverified`;
}

function humanize(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
