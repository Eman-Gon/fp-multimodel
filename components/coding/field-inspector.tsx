"use client";

import { ToggleLeft, ToggleRight } from "lucide-react";
import {
  COMMUNICATIVE_FUNCTIONS,
  GESTURE_REGIONS,
  GESTURE_TYPES,
  SENTENCE_TYPES,
  TARGET_PARTICLES,
  TONE_CONTOURS,
} from "@/lib/vocab.ts";
import { humanizeCode } from "@/lib/track-c/display.ts";
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
  readonly particleInstanceId: string;
  readonly activeTarget: FieldTarget;
  readonly summary: ReviewSummary;
  readonly busy: boolean;
  readonly liveMessage: string;
  readonly onActivate: (target: FieldTarget) => void;
  readonly onReview: (target: FieldTarget, review: FieldReview) => void;
}

export function FieldInspector({
  clip,
  particleInstanceId,
  activeTarget,
  summary,
  busy,
  liveMessage,
  onActivate,
  onReview,
}: FieldInspectorProps) {
  const particle =
    clip.particle_instances.find(
      ({ instance_id }) => instance_id === particleInstanceId,
    ) ?? clip.particle_instances[0];
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
  const gestureIsAbsent =
    particle.fields.gesture_present.state === "confirmed" &&
    currentValue(particle.fields.gesture_present) === false;

  return (
    <aside className="field-inspector" aria-labelledby="fields-heading">
      <header className="field-inspector__header">
        <div>
          <h2 id="fields-heading">Review suggestions</h2>
          <p title={clip.fixture_note}>
            {resolved} of {summary.total} reviewed
            {summary.remaining === 0 ? "" : ` · ${summary.remaining} left`}
          </p>
        </div>
        <div className="provenance-legend" aria-label="Field provenance legend">
          <span>
            <i className="legend-dot legend-dot--suggested" />
            {clip.demo_fixture ? "Suggested · simulated" : "AI suggested"}
          </span>
          <span>
            <i className="legend-dot legend-dot--confirmed" />
            Confirmed
          </span>
        </div>
      </header>

      <fieldset
        className={`field-inspector__body${clip.clip.status === "confirmed" ? " field-inspector__body--read-only" : ""}`}
        disabled={clip.clip.status === "confirmed" || busy}
        aria-busy={busy}
        aria-label="Reviewable coding fields"
      >
        <InspectorSection
          title="Participants"
          fields={[clip.fields.speaker_id, clip.fields.addressee_id]}
        >
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

        <InspectorSection
          title="Particle"
          fields={[particle.fields.fp_token, particle.fields.fp_timing]}
        >
        <FieldRow
          label="Particle"
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
          label="Particle count"
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
          label="Particle timing"
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

        <InspectorSection
          title="Gesture"
          fields={[
            particle.fields.gesture_present,
            particle.fields.gesture_type,
            particle.fields.gesture_region,
            particle.fields.gesture_timing,
          ]}
        >
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
            onClick={() => {
              const nextPresent = !currentValue(
                particle.fields.gesture_present,
              );
              review(particleTarget("gesture_present"), {
                action: "edit",
                value: nextPresent,
              });
            }}
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
        {gestureIsAbsent ? (
          <p className="gesture-not-applicable">
            Gesture type, region, and timing are not applicable.
          </p>
        ) : (
          <>
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
              {humanizeCode(gestureType)}
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
            value={currentValue(particle.fields.gesture_region) ?? ""}
            aria-label="Gesture region"
            onChange={(event) =>
              review(particleTarget("gesture_region"), {
                action: "edit",
                value: event.currentTarget.value,
              })
            }
          >
            <option value="" disabled>
              No region suggested
            </option>
            {GESTURE_REGIONS.map((region) => (
              <option value={region} key={region}>
                {humanizeCode(region)}
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
          </>
        )}
        </InspectorSection>

        <InspectorSection
          title="Utterance"
          fields={[clip.fields.sentence_type, clip.fields.tone_contour]}
        >
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
                {humanizeCode(sentenceType)}
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
                {humanizeCode(tone)}
              </option>
            ))}
          </select>
        </FieldRow>
        </InspectorSection>

        <InspectorSection
          title="Meaning"
          fields={[
            clip.fields.discourse_context,
            clip.fields.clauses,
            clip.fields.communicative_function,
            clip.fields.meaning_explanation,
          ]}
        >
          <FieldRow
            label="Discourse context"
            hint="Edit for local context"
            field={clip.fields.discourse_context}
            target={clipTarget("discourse_context")}
            active={isActive(clipTarget("discourse_context"))}
            expanded
            onActivate={onActivate}
            onAccept={accept}
            onSkip={skip}
          >
            <textarea
              defaultValue={currentValue(clip.fields.discourse_context)}
              aria-label="Discourse context"
              rows={2}
              onBlur={(event) => {
                const value = event.currentTarget.value.trim();
                if (
                  value.length > 0 &&
                  value !== currentValue(clip.fields.discourse_context)
                ) {
                  review(clipTarget("discourse_context"), {
                    action: "edit",
                    value,
                  });
                }
              }}
            />
          </FieldRow>
          <FieldRow
            label="Sentence"
            hint="Corrected transcript"
            field={clip.fields.sentence_text}
            target={clipTarget("sentence_text")}
            active={isActive(clipTarget("sentence_text"))}
            onActivate={onActivate}
            onAccept={accept}
            onSkip={skip}
          >
            <output className="read-only-control" lang="zh-Hans">
              {currentValue(clip.fields.sentence_text)}
            </output>
          </FieldRow>
          <FieldRow
            label="Clauses"
            hint="Separate with |"
            field={clip.fields.clauses}
            target={clipTarget("clauses")}
            active={isActive(clipTarget("clauses"))}
            onActivate={onActivate}
            onAccept={accept}
            onSkip={skip}
          >
            <input
              type="text"
              defaultValue={currentValue(clip.fields.clauses).join(" | ")}
              aria-label="Clauses, separated by vertical bars"
              onBlur={(event) => {
                const value = event.currentTarget.value
                  .split("|")
                  .map((clause) => clause.trim())
                  .filter(Boolean);
                if (
                  value.length > 0 &&
                  JSON.stringify(value) !==
                    JSON.stringify(currentValue(clip.fields.clauses))
                ) {
                  review(clipTarget("clauses"), {
                    action: "edit",
                    value,
                  });
                }
              }}
            />
          </FieldRow>
          <FieldRow
            label="Function"
            field={clip.fields.communicative_function}
            target={clipTarget("communicative_function")}
            active={isActive(clipTarget("communicative_function"))}
            onActivate={onActivate}
            onAccept={accept}
            onSkip={skip}
          >
            <select
              value={currentValue(clip.fields.communicative_function)}
              aria-label="Communicative function"
              onChange={(event) =>
                review(clipTarget("communicative_function"), {
                  action: "edit",
                  value: event.currentTarget.value,
                })
              }
            >
              {COMMUNICATIVE_FUNCTIONS.map((communicativeFunction) => (
                <option
                  value={communicativeFunction}
                  key={communicativeFunction}
                >
                  {humanizeCode(communicativeFunction)}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow
            label="Explanation"
            hint="Evidence-based meaning"
            field={clip.fields.meaning_explanation}
            target={clipTarget("meaning_explanation")}
            active={isActive(clipTarget("meaning_explanation"))}
            expanded
            onActivate={onActivate}
            onAccept={accept}
            onSkip={skip}
          >
            <textarea
              defaultValue={currentValue(clip.fields.meaning_explanation)}
              aria-label="Meaning explanation"
              rows={2}
              onBlur={(event) => {
                const value = event.currentTarget.value.trim();
                if (
                  value.length > 0 &&
                  value !== currentValue(clip.fields.meaning_explanation)
                ) {
                  review(clipTarget("meaning_explanation"), {
                    action: "edit",
                    value,
                  });
                }
              }}
            />
          </FieldRow>
        </InspectorSection>
      </fieldset>

      <footer className="review-footer">
        <div className="review-footer__summary">
          <span>
            {resolved} of {summary.total} fields reviewed
          </span>
          <span>
            {summary.remaining === 0 ? "Ready" : `${summary.remaining} left`}
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
        {liveMessage.length > 0 ? (
          <p
            className={`review-feedback${clip.clip.status === "confirmed" ? " review-feedback--success" : ""}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {liveMessage}
          </p>
        ) : null}
        <details className="keyboard-shortcuts">
          <summary>Keyboard shortcuts</summary>
          <div className="keyboard-hints" aria-label="Keyboard shortcuts">
            <span>
              <kbd>C</kbd> confirm field
            </span>
            <span>
              <kbd>S</kbd> skip
            </span>
            <span>
              <kbd>Q</kbd> queue
            </span>
            <span>
              <kbd>N</kbd> next clip
            </span>
            <span>
              <kbd>,</kbd>
              <kbd>.</kbd> step frame
            </span>
          </div>
        </details>
        <p>
          {clip.clip.status === "confirmed"
            ? "Confirmed coding is read-only."
            : summary.ready
              ? "Every reviewable field has a human decision. Confirm the clip in the header."
              : `Confirm or skip ${summary.remaining} remaining field${summary.remaining === 1 ? "" : "s"}.`}
        </p>
      </footer>
    </aside>
  );
}

function InspectorSection({
  title,
  fields,
  children,
}: Readonly<{
  title: string;
  fields: readonly ReviewField<unknown>[];
  children: React.ReactNode;
}>) {
  const remaining = fields.filter(({ state }) => state === "suggested").length;
  return (
    <details
      className="inspector-section"
      open={remaining > 0 ? true : undefined}
    >
      <summary>
        <span>{title}</span>
        <small>{remaining === 0 ? "Reviewed" : `${remaining} left`}</small>
      </summary>
      <div>{children}</div>
    </details>
  );
}

function currentValue<T>(field: ReviewField<T>): T {
  return field.value ?? field.suggestion.value;
}

function formatRangeField<T extends TimeRange | null>(
  field: ReviewField<T>,
): string {
  if (field.state === "skipped") {
    return "Not applicable";
  }
  const range = currentValue(field);
  if (range === null) {
    return "No boundary suggested";
  }
  return formatSourceRange(range.start_ms, range.end_ms);
}
