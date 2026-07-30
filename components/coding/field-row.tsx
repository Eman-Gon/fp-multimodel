"use client";

import type { ReactNode } from "react";
import { Check, Minus, SkipForward } from "lucide-react";
import type {
  FieldTarget,
  ReviewField,
} from "@/lib/track-c/types.ts";
import { targetKey } from "@/lib/track-c/review.ts";

interface FieldRowProps {
  readonly label: string;
  readonly field: ReviewField<unknown>;
  readonly target: FieldTarget;
  readonly active: boolean;
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
  const statusLabel =
    field.state === "suggested"
      ? `AI suggested${confidence === null ? "" : `, ${confidence}% confidence`}`
      : field.state === "confirmed"
        ? "Confirmed by reviewer"
        : "Explicitly skipped";

  return (
    <div
      className={[
        "field-row",
        `field-row--${field.state}`,
        active ? "field-row--active" : "",
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
      <button
        type="button"
        className={`provenance provenance--${field.state}`}
        onClick={(event) => {
          event.stopPropagation();
          onAccept(target);
        }}
        aria-label={
          field.state === "skipped"
            ? `Restore and confirm ${label}`
            : field.state === "confirmed"
              ? `${label} is confirmed`
              : `Confirm ${label}`
        }
        aria-pressed={field.state === "confirmed"}
        title={statusLabel}
      >
        {field.state === "confirmed" ? (
          <Check aria-hidden="true" />
        ) : field.state === "skipped" ? (
          <Minus aria-hidden="true" />
        ) : null}
        <span className="visually-hidden">{statusLabel}</span>
      </button>
      <div className="field-row__control">{children}</div>
      <div className="field-row__meta" aria-hidden="true">
        {field.state === "suggested" && confidence !== null ? (
          <span>{confidence}%</span>
        ) : field.state === "confirmed" ? (
          <span>Done</span>
        ) : (
          <span>Skipped</span>
        )}
      </div>
      {field.state === "suggested" ? (
        <button
          type="button"
          className="field-row__skip"
          onClick={(event) => {
            event.stopPropagation();
            onSkip(target);
          }}
          aria-label={`Skip ${label}`}
          title={`Skip ${label}`}
        >
          <SkipForward aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

