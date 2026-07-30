"use client";

import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import type {
  FieldTarget,
  ReviewField,
} from "@/lib/track-c/types.ts";
import { humanizeCode } from "@/lib/track-c/display.ts";
import { targetKey } from "@/lib/track-c/review.ts";

interface FieldRowProps {
  readonly label: string;
  readonly field: ReviewField<unknown>;
  readonly target: FieldTarget;
  readonly active: boolean;
  readonly expanded?: boolean;
  readonly hint?: string;
  readonly children: ReactNode;
  readonly onActivate: (target: FieldTarget) => void;
  readonly onAccept: (target: FieldTarget) => void;
  readonly onSkip: (target: FieldTarget) => void;
}

export function FieldRow({
  label,
  field,
  target,
  active,
  expanded = false,
  hint,
  children,
  onActivate,
  onAccept,
  onSkip,
}: FieldRowProps) {
  const confidence =
    field.suggestion.confidence === null
      ? null
      : Math.round(field.suggestion.confidence * 100);
  const wasEdited =
    field.state === "confirmed" && field.review?.action === "edited";
  const suggestionSource = humanizeCode(field.suggestion.source);
  const statusLabel =
    field.state === "suggested"
      ? `${suggestionSource} suggested${confidence === null ? "" : `, ${confidence}% confidence`}`
      : field.state === "confirmed"
        ? wasEdited
          ? `Edited by reviewer; original ${suggestionSource} suggestion retained`
          : `Confirmed by reviewer; original ${suggestionSource} suggestion retained`
        : `Explicitly skipped; original ${suggestionSource} suggestion retained`;

  return (
    <div
      className={[
        "field-row",
        `field-row--${field.state}`,
        active ? "field-row--active" : "",
        expanded ? "field-row--expanded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-field-key={targetKey(target)}
      onFocusCapture={() => onActivate(target)}
      onClick={() => onActivate(target)}
    >
      <div className="field-row__label">
        <span>{label}</span>
        {hint === undefined ? null : <small>{hint}</small>}
      </div>
      <div className="field-row__control">{children}</div>
      <div className={`field-row__meta field-row__meta--${field.state}`}>
        {field.state === "suggested" && confidence !== null ? (
          <span title={statusLabel}>{confidence}%</span>
        ) : field.state === "confirmed" ? (
          <span title={statusLabel}>
            <Check aria-hidden="true" />
            {wasEdited ? "Edited" : "Confirmed"}
          </span>
        ) : (
          <span title={statusLabel}>
            <Minus aria-hidden="true" />
            Skipped
          </span>
        )}
      </div>
      <div className="field-row__actions">
        {field.state === "suggested" ? (
          <>
            <button
              type="button"
              className="field-row__confirm"
              onClick={(event) => {
                event.stopPropagation();
                onAccept(target);
              }}
            >
              Confirm
            </button>
            <button
              type="button"
              className="field-row__skip"
              onClick={(event) => {
                event.stopPropagation();
                onSkip(target);
              }}
            >
              Skip
            </button>
          </>
        ) : field.state === "skipped" ? (
          <button
            type="button"
            className="field-row__confirm"
            onClick={(event) => {
              event.stopPropagation();
              onAccept(target);
            }}
          >
            Restore
          </button>
        ) : null}
      </div>
      <span className="visually-hidden">{statusLabel}</span>
    </div>
  );
}
