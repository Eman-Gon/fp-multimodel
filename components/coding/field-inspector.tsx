"use client";

import { ChevronUp, ToggleLeft, ToggleRight } from "lucide-react";
import {
  GESTURE_REGIONS,
  GESTURE_TYPES,
  SENTENCE_TYPES,
  TARGET_PARTICLES,
  TONE_CONTOURS,
} from "@/lib/vocab.ts";
import type {
  ClipDetail,
  FieldReview,
  FieldTarget,
  ReviewField,
  ReviewSummary,
} from "@/lib/track-c/types.ts";
import { targetKey } from "@/lib/track-c/review.ts";
import type { TimeRange } from "@/lib/types.ts";
import { FieldRow } from "./field-row.tsx";
import { formatSourceRange } from "./time.ts";

interface FieldInspectorProps {
  readonly clip: ClipDetail;
  readonly activeTarget: FieldTarget;
  readonly summary: ReviewSummary;
  readonly saveState: "saved" | "saving" | "error";
  readonly onActivate: (target: FieldTarget) => void;
  readonly onReview: (target: FieldTarget, review: FieldReview) => void;
  readonly onConfirmClip: () => void;
}

export function FieldInspector({
  clip,
  activeTarget,
  summary,
  saveState,
  onActivate,
  onReview,
  onConfirmClip,
}: FieldInspectorProps) {
  const particle = clip.particle_instances[0];
  if (particle === undefined) {
    return null;
  }

  const clipTarget = (field: keyof ClipDetail["fields"]): FieldTarget => ({
    scope: "clip",
    field,
  });
  const particleTarget = (
    field: keyof typeof particle.fields,
  ): FieldTarget => ({
    scope: "particle",
    instance_id: particle.instance_id,
    field,
  });
  const isActive = (target: FieldTarget) =>
    targetKey(target) === targetKey(activeTarget);
  const review = (target: FieldTarget, nextReview: FieldReview) =>
    onReview(target, nextReview);
  const accept = (target: FieldTarget) =>
    review(target, { action: "accept" });
  const skip = (target: FieldTarget) =>
    review(target, {
      action: "skip",
      reason: "Reviewer explicitly skipped this field.",
    });
  const resolved = summary.confirmed + summary.skipped;
  const progress = (resolved / summary.total) * 100;

  return (
    <aside className="field-inspector" aria-labelledby="fields-heading">
      <header className="field-inspector__header">
        <div>
          <h2 id="fields-heading">Coding fields</h2>
          <p title={clip.fixture_note}>Seeded review fixture</p>
        </div>
        <div className="provenance-legend" aria-label="Field provenance legend">
          <span>
            <i className="legend-dot legend-dot--suggested" />
            AI suggested
          </span>
          <span>
            <i className="legend-dot legend-dot--confirmed" />
            Confirmed
          </span>
        </div>
      </header>

      <InspectorSection title="Participants">
        <FieldRow
          label="Speaker"
          field={clip.fields.speaker_id}
          target={clipTarget("speaker_id")}
          active={isActive(clipTarget("speaker_id"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <select
            value={currentValue(clip.fields.speaker_id)}
            aria-label="Speaker"
            onChange={(event) =>
              review(clipTarget("speaker_id"), {
                action: "edit",
                value: event.currentTarget.value,
              })
            }
          >
            {clip.participant_options.map(({ id, label }) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow
          label="Addressee"
          hint="Explicit confirm required"
          field={clip.fields.addressee_id}
          target={clipTarget("addressee_id")}
          active={isActive(clipTarget("addressee_id"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <select
            value={currentValue(clip.fields.addressee_id)}
            aria-label="Addressee"
            onChange={(event) =>
              review(clipTarget("addressee_id"), {
                action: "edit",
                value: event.currentTarget.value,
              })
            }
          >
            {clip.participant_options.map(({ id, label }) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </FieldRow>
      </InspectorSection>

      <InspectorSection title="Particle">
        <FieldRow
          label="FP token"
          hint={`Surface form ${particle.surface_form}`}
          field={particle.fields.fp_token}
          target={particleTarget("fp_token")}
          active={isActive(particleTarget("fp_token"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <select
            value={currentValue(particle.fields.fp_token)}
            aria-label="Final particle token"
            onChange={(event) =>
              review(particleTarget("fp_token"), {
                action: "edit",
                value: event.currentTarget.value,
              })
            }
          >
            {TARGET_PARTICLES.map(({ token, pinyin }) => (
              <option value={token} key={token}>
                {token} · {pinyin}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow
          label="FP count"
          hint="Derived from instances"
          field={clip.fields.fp_count}
          target={clipTarget("fp_count")}
          active={isActive(clipTarget("fp_count"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <output className="read-only-control">
            {currentValue(clip.fields.fp_count)}
          </output>
        </FieldRow>
        <FieldRow
          label="FP timing"
          hint="Absolute source time"
          field={particle.fields.fp_timing}
          target={particleTarget("fp_timing")}
          active={isActive(particleTarget("fp_timing"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <output className="timing-control">
            {formatRangeField(particle.fields.fp_timing)}
          </output>
        </FieldRow>
      </InspectorSection>

      <InspectorSection title="Gesture">
        <FieldRow
          label="Gesture present"
          field={particle.fields.gesture_present}
          target={particleTarget("gesture_present")}
          active={isActive(particleTarget("gesture_present"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <button
            type="button"
            className={`toggle-control${currentValue(particle.fields.gesture_present) ? " toggle-control--on" : ""}`}
            role="switch"
            aria-checked={currentValue(particle.fields.gesture_present)}
            onClick={() =>
              review(particleTarget("gesture_present"), {
                action: "edit",
                value: !currentValue(particle.fields.gesture_present),
              })
            }
          >
            {currentValue(particle.fields.gesture_present) ? (
              <ToggleRight aria-hidden="true" />
            ) : (
              <ToggleLeft aria-hidden="true" />
            )}
            <span>
              {currentValue(particle.fields.gesture_present) ? "Yes" : "No"}
            </span>
          </button>
        </FieldRow>
        <FieldRow
          label="Gesture type"
          field={particle.fields.gesture_type}
          target={particleTarget("gesture_type")}
          active={isActive(particleTarget("gesture_type"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <select
            value={currentValue(particle.fields.gesture_type)}
            aria-label="Gesture type"
            onChange={(event) =>
              review(particleTarget("gesture_type"), {
                action: "edit",
                value: event.currentTarget.value,
              })
            }
          >
            {GESTURE_TYPES.map((gestureType) => (
              <option value={gestureType} key={gestureType}>
                {gestureType}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow
          label="Region"
          field={particle.fields.gesture_region}
          target={particleTarget("gesture_region")}
          active={isActive(particleTarget("gesture_region"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <select
            value={currentValue(particle.fields.gesture_region)}
            aria-label="Gesture region"
            onChange={(event) =>
              review(particleTarget("gesture_region"), {
                action: "edit",
                value: event.currentTarget.value,
              })
            }
          >
            {GESTURE_REGIONS.map((region) => (
              <option value={region} key={region}>
                {region}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow
          label="Gesture timing"
          hint="Absolute source time"
          field={particle.fields.gesture_timing}
          target={particleTarget("gesture_timing")}
          active={isActive(particleTarget("gesture_timing"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <output className="timing-control">
            {formatRangeField(particle.fields.gesture_timing)}
          </output>
        </FieldRow>
      </InspectorSection>

      <InspectorSection title="Utterance">
        <FieldRow
          label="Sentence type"
          field={clip.fields.sentence_type}
          target={clipTarget("sentence_type")}
          active={isActive(clipTarget("sentence_type"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <select
            value={currentValue(clip.fields.sentence_type)}
            aria-label="Sentence type"
            onChange={(event) =>
              review(clipTarget("sentence_type"), {
                action: "edit",
                value: event.currentTarget.value,
              })
            }
          >
            {SENTENCE_TYPES.map((sentenceType) => (
              <option value={sentenceType} key={sentenceType}>
                {sentenceType}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow
          label="Tone contour"
          field={clip.fields.tone_contour}
          target={clipTarget("tone_contour")}
          active={isActive(clipTarget("tone_contour"))}
          onActivate={onActivate}
          onAccept={accept}
          onSkip={skip}
        >
          <select
            value={currentValue(clip.fields.tone_contour)}
            aria-label="Tone contour"
            onChange={(event) =>
              review(clipTarget("tone_contour"), {
                action: "edit",
                value: event.currentTarget.value,
              })
            }
          >
            {TONE_CONTOURS.map((tone) => (
              <option value={tone} key={tone}>
                {tone}
              </option>
            ))}
          </select>
        </FieldRow>
      </InspectorSection>

      <footer className="review-footer">
        <div className="review-footer__summary">
          <span>
            {resolved} of {summary.total} fields reviewed
          </span>
          <span className={`save-state save-state--${saveState}`}>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "error"
                ? "Save failed"
                : "Saved"}
          </span>
        </div>
        <div
          className="review-footer__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={summary.total}
          aria-valuenow={resolved}
          aria-label="Review progress"
        >
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="keyboard-hints" aria-label="Keyboard shortcuts">
          <span>
            <kbd>C</kbd> confirm field
          </span>
          <span>
            <kbd>S</kbd> skip
          </span>
          <span>
            <kbd>N</kbd> next clip
          </span>
          <span>
            <kbd>,</kbd>
            <kbd>.</kbd> step frame
          </span>
        </div>
        <button
          type="button"
          className={`button button--confirm${summary.ready ? "" : " button--disabled"}`}
          aria-disabled={!summary.ready || saveState === "saving"}
          onClick={onConfirmClip}
        >
          {clip.clip.status === "confirmed" ? "Clip confirmed" : "Confirm clip"}
        </button>
        <p>
          {summary.ready
            ? summary.skipped > 0
              ? `${summary.skipped} skipped field${summary.skipped === 1 ? "" : "s"} will remain explicit.`
              : "Every field has a human decision."
            : `Confirm or skip ${summary.remaining} remaining field${summary.remaining === 1 ? "" : "s"} to continue.`}
        </p>
      </footer>
    </aside>
  );
}

function InspectorSection({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="inspector-section">
      <h3>
        {title}
        <ChevronUp aria-hidden="true" />
      </h3>
      {children}
    </section>
  );
}

function currentValue<T>(field: ReviewField<T>): T {
  return field.value ?? field.suggestion.value;
}

function formatRangeField(field: ReviewField<TimeRange>): string {
  const range = currentValue(field);
  return formatSourceRange(range.start_ms, range.end_ms);
}

