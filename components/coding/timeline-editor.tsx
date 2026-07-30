"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { TimeRange } from "@/lib/types.ts";
import type { ReviewField } from "@/lib/track-c/types.ts";
import {
  clamp,
  formatRelativeTime,
  frameToSourceMilliseconds,
  sourceMillisecondsToFrame,
} from "./time.ts";

const WAVEFORM_HEIGHTS = Array.from({ length: 92 }, (_, index) => {
  const primary = Math.abs(Math.sin(index * 0.83)) * 18;
  const secondary = Math.abs(Math.cos(index * 0.37)) * 8;
  return Math.round(5 + primary + secondary);
});

interface TimelineEditorProps {
  readonly clipStartMs: number;
  readonly clipEndMs: number;
  readonly currentSourceMs: number;
  readonly fps: number;
  readonly particleTiming: ReviewField<TimeRange>;
  readonly gestureTiming: ReviewField<TimeRange | null>;
  readonly disabled: boolean;
  readonly onSeek: (sourceMilliseconds: number) => void;
  readonly onCommit: (
    field: "fp_timing" | "gesture_timing",
    value: TimeRange,
  ) => void;
  readonly onActivate: (field: "fp_timing" | "gesture_timing") => void;
}

export function TimelineEditor({
  clipStartMs,
  clipEndMs,
  currentSourceMs,
  fps,
  particleTiming,
  gestureTiming,
  disabled,
  onSeek,
  onCommit,
  onActivate,
}: TimelineEditorProps) {
  const durationMs = clipEndMs - clipStartMs;
  const playheadPercent =
    ((currentSourceMs - clipStartMs) / durationMs) * 100;
  const ticks = useMemo(() => {
    const values: number[] = [];
    for (let value = 0; value < durationMs; value += 1_000) {
      values.push(value);
    }
    const lastTick = values.at(-1);
    if (lastTick !== undefined && durationMs - lastTick < 600) {
      values[values.length - 1] = durationMs;
    } else {
      values.push(durationMs);
    }
    return values;
  }, [durationMs]);

  return (
    <section className="timeline" aria-labelledby="timeline-heading">
      <div className="timeline__heading">
        <div>
          <h2 id="timeline-heading">Timing</h2>
          <p>Ranges save as absolute source milliseconds.</p>
        </div>
        <output>
          Source {formatRelativeTime(currentSourceMs)}
          <span>
            frame {sourceMillisecondsToFrame(currentSourceMs, fps)}
          </span>
        </output>
      </div>
      <div className="timeline__canvas">
        <div
          className="timeline__playhead"
          style={{ "--playhead": `${playheadPercent}%` } as CSSProperties}
          aria-hidden="true"
        />
        <button
          type="button"
          className="timeline__ruler"
          onClick={(event) => {
            if (event.detail === 0) {
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            const percent = clamp(
              (event.clientX - rect.left) / rect.width,
              0,
              1,
            );
            onSeek(clipStartMs + Math.round(percent * durationMs));
          }}
          onKeyDown={(event) => {
            const frameMs = Math.max(1, Math.round(1_000 / fps));
            if (event.key === "Home") {
              event.preventDefault();
              onSeek(clipStartMs);
            } else if (event.key === "End") {
              event.preventDefault();
              onSeek(clipEndMs);
            } else if (
              event.key === "ArrowLeft" ||
              event.key === "ArrowRight"
            ) {
              event.preventDefault();
              onSeek(
                clamp(
                  currentSourceMs +
                    (event.key === "ArrowLeft" ? -frameMs : frameMs),
                  clipStartMs,
                  clipEndMs,
                ),
              );
            }
          }}
          aria-label="Seek on clip timeline"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              style={{ left: `${(tick / durationMs) * 100}%` }}
            >
              {formatRelativeTime(tick)}
            </span>
          ))}
        </button>
        <div className="timeline__waveform" aria-hidden="true">
          {WAVEFORM_HEIGHTS.map((height, index) => (
            <i key={index} style={{ height }} />
          ))}
        </div>
        <RangeTrack
          label="Particle"
          className="range-track--particle"
          fieldName="fp_timing"
          field={particleTiming}
          clipStartMs={clipStartMs}
          clipEndMs={clipEndMs}
          fps={fps}
          disabled={disabled}
          onCommit={onCommit}
          onActivate={onActivate}
        />
        <RangeTrack
          label="Gesture"
          className="range-track--gesture"
          fieldName="gesture_timing"
          field={gestureTiming}
          clipStartMs={clipStartMs}
          clipEndMs={clipEndMs}
          fps={fps}
          disabled={disabled}
          onCommit={onCommit}
          onActivate={onActivate}
        />
      </div>
    </section>
  );
}

interface RangeTrackProps {
  readonly label: string;
  readonly className: string;
  readonly fieldName: "fp_timing" | "gesture_timing";
  readonly field: ReviewField<TimeRange | null>;
  readonly clipStartMs: number;
  readonly clipEndMs: number;
  readonly fps: number;
  readonly disabled: boolean;
  readonly onCommit: (
    field: "fp_timing" | "gesture_timing",
    value: TimeRange,
  ) => void;
  readonly onActivate: (field: "fp_timing" | "gesture_timing") => void;
}

function RangeTrack({
  label,
  className,
  fieldName,
  field,
  clipStartMs,
  clipEndMs,
  fps,
  disabled,
  onCommit,
  onActivate,
}: RangeTrackProps) {
  const sourceRange = field.value ?? field.suggestion.value;
  if (sourceRange === null) {
    return (
      <fieldset
        className={`range-track ${className}`}
        onFocusCapture={() => onActivate(fieldName)}
        disabled
      >
        <legend>
          <span>{label}</span>
          <em>No boundary suggested</em>
        </legend>
        <div className="range-track__rail" />
      </fieldset>
    );
  }
  return (
    <EditableRangeTrack
      label={label}
      className={className}
      fieldName={fieldName}
      field={field}
      sourceRange={sourceRange}
      clipStartMs={clipStartMs}
      clipEndMs={clipEndMs}
      fps={fps}
      disabled={disabled}
      onCommit={onCommit}
      onActivate={onActivate}
    />
  );
}

interface EditableRangeTrackProps extends RangeTrackProps {
  readonly sourceRange: TimeRange;
}

function EditableRangeTrack({
  label,
  className,
  fieldName,
  field,
  sourceRange,
  clipStartMs,
  clipEndMs,
  fps,
  disabled,
  onCommit,
  onActivate,
}: EditableRangeTrackProps) {
  const committedStart = sourceRange.start_ms - clipStartMs;
  const committedEnd = sourceRange.end_ms - clipStartMs;
  const durationMs = clipEndMs - clipStartMs;
  const minimumGapMs = Math.max(1, Math.round(1_000 / fps));
  const [preview, setPreview] = useState({
    start: committedStart,
    end: committedEnd,
  });

  useEffect(() => {
    setPreview({ start: committedStart, end: committedEnd });
  }, [committedEnd, committedStart]);

  const commit = () => {
    if (
      preview.start === committedStart &&
      preview.end === committedEnd
    ) {
      return;
    }
    onCommit(fieldName, {
      start_ms: clipStartMs + preview.start,
      end_ms: clipStartMs + preview.end,
    });
  };

  const setHandle = (handle: "start" | "end", nextValue: number) => {
    setPreview((current) => {
      if (handle === "start") {
        return {
          ...current,
          start: clamp(nextValue, 0, current.end - minimumGapMs),
        };
      }
      return {
        ...current,
        end: clamp(
          nextValue,
          current.start + minimumGapMs,
          durationMs,
        ),
      };
    });
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    handle: "start" | "end",
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setPreview({ start: committedStart, end: committedEnd });
      return;
    }

    const direction =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? 1
          : 0;
    if (direction === 0) {
      return;
    }

    event.preventDefault();
    const frames = event.shiftKey ? 10 : 1;
    const relativeValue = handle === "start" ? preview.start : preview.end;
    const sourceFrame = sourceMillisecondsToFrame(
      clipStartMs + relativeValue,
      fps,
    );
    const nextSourceMs = frameToSourceMilliseconds(
      sourceFrame + direction * frames,
      fps,
    );
    setHandle(handle, nextSourceMs - clipStartMs);
  };

  const startPercent = (preview.start / durationMs) * 100;
  const endPercent = (preview.end / durationMs) * 100;
  const statusText =
    field.state === "suggested"
      ? "AI suggested"
      : field.state === "confirmed"
        ? "Confirmed"
        : "Skipped";

  return (
    <fieldset
      className={`range-track ${className}`}
      onFocusCapture={() => onActivate(fieldName)}
      disabled={disabled}
    >
      <legend>
        <span>{label}</span>
        <em>{statusText}</em>
      </legend>
      <div className="range-track__rail">
        <div
          className="range-track__selection"
          style={
            {
              "--range-start": `${startPercent}%`,
              "--range-width": `${endPercent - startPercent}%`,
            } as CSSProperties
          }
        >
          <span>
            {formatRelativeTime(preview.start).slice(3)}–
            {formatRelativeTime(preview.end).slice(3)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={durationMs}
          step={1}
          value={preview.start}
          aria-label={`${label} start`}
          aria-valuetext={`${formatRelativeTime(preview.start)} in clip, source frame ${sourceMillisecondsToFrame(clipStartMs + preview.start, fps)}`}
          onChange={(event) =>
            setHandle("start", Number(event.currentTarget.value))
          }
          onKeyDown={(event) => handleKeyDown(event, "start")}
          onKeyUp={commit}
          onPointerUp={commit}
          onBlur={commit}
        />
        <input
          type="range"
          min={0}
          max={durationMs}
          step={1}
          value={preview.end}
          aria-label={`${label} end`}
          aria-valuetext={`${formatRelativeTime(preview.end)} in clip, source frame ${sourceMillisecondsToFrame(clipStartMs + preview.end, fps)}`}
          onChange={(event) =>
            setHandle("end", Number(event.currentTarget.value))
          }
          onKeyDown={(event) => handleKeyDown(event, "end")}
          onKeyUp={commit}
          onPointerUp={commit}
          onBlur={commit}
        />
      </div>
    </fieldset>
  );
}
