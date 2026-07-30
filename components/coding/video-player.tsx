"use client";

import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ClipPlayerController } from "./use-clip-player.ts";
import { formatRelativeTime } from "./time.ts";

interface VideoPlayerProps {
  readonly sourceUrl: string;
  readonly posterUrl: string;
  readonly clipStartMs: number;
  readonly clipEndMs: number;
  readonly controller: ClipPlayerController;
}

export function VideoPlayer({
  sourceUrl,
  posterUrl,
  clipStartMs,
  clipEndMs,
  controller,
}: VideoPlayerProps) {
  const durationMs = clipEndMs - clipStartMs;
  const relativeMs = controller.currentSourceMs - clipStartMs;

  return (
    <section className="video-player" aria-label="Clip video">
      <div className="video-player__stage">
        <video
          ref={controller.videoRef}
          src={sourceUrl}
          poster={posterUrl}
          preload="metadata"
          playsInline
          onClick={() => void controller.togglePlayback()}
        />
        <button
          type="button"
          className="video-player__center-control"
          aria-label={controller.playing ? "Pause clip" : "Play clip"}
          onClick={() => void controller.togglePlayback()}
        >
          {controller.playing ? (
            <Pause aria-hidden="true" fill="currentColor" />
          ) : (
            <Play aria-hidden="true" fill="currentColor" />
          )}
        </button>
      </div>
      <div className="video-controls">
        <button
          type="button"
          className="icon-button icon-button--dark"
          aria-label={controller.playing ? "Pause clip" : "Play clip"}
          onClick={() => void controller.togglePlayback()}
        >
          {controller.playing ? (
            <Pause aria-hidden="true" fill="currentColor" />
          ) : (
            <Play aria-hidden="true" fill="currentColor" />
          )}
        </button>
        <output className="video-controls__time" aria-live="off">
          <strong>{formatRelativeTime(relativeMs)}</strong>
          <span>/</span>
          <span>{formatRelativeTime(durationMs)}</span>
        </output>
        <input
          className="video-controls__scrubber"
          type="range"
          min={0}
          max={durationMs}
          step={1}
          value={relativeMs}
          aria-label="Clip playhead"
          onChange={(event) =>
            controller.seekSourceMs(
              clipStartMs + Number(event.currentTarget.value),
            )
          }
        />
        <div className="video-controls__frame-group">
          <button
            type="button"
            onClick={() => controller.stepFrame(-1)}
            aria-label="Previous frame, comma shortcut"
          >
            <SkipBack aria-hidden="true" />
            <span>−1 frame</span>
          </button>
          <button
            type="button"
            onClick={() => controller.stepFrame(1)}
            aria-label="Next frame, period shortcut"
          >
            <span>+1 frame</span>
            <SkipForward aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="icon-button icon-button--dark video-controls__mute"
          onClick={controller.toggleMuted}
          aria-label={controller.muted ? "Unmute clip" : "Mute clip"}
        >
          {controller.muted ? (
            <VolumeX aria-hidden="true" />
          ) : (
            <Volume2 aria-hidden="true" />
          )}
        </button>
        <label className="video-controls__rate">
          <span className="visually-hidden">Playback rate</span>
          <select
            value={controller.playbackRate}
            onChange={(event) =>
              controller.setPlaybackRate(Number(event.currentTarget.value))
            }
          >
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1.0×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </label>
      </div>
    </section>
  );
}
