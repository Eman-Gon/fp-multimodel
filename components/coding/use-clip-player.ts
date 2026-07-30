"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clamp,
  frameToSourceMilliseconds,
  sourceMillisecondsToFrame,
} from "./time.ts";

interface ClipPlayerOptions {
  readonly clipStartMs: number;
  readonly clipEndMs: number;
  readonly fps: number;
}

export interface ClipPlayerController {
  readonly videoRef: React.RefObject<HTMLVideoElement | null>;
  readonly currentSourceMs: number;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly playbackRate: number;
  readonly togglePlayback: () => Promise<void>;
  readonly seekSourceMs: (sourceMilliseconds: number) => void;
  readonly stepFrame: (delta: -1 | 1) => void;
  readonly toggleMuted: () => void;
  readonly setPlaybackRate: (rate: number) => void;
}

export function useClipPlayer({
  clipStartMs,
  clipEndMs,
  fps,
}: ClipPlayerOptions): ClipPlayerController {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceTimeRef = useRef(clipStartMs);
  const [currentSourceMs, setCurrentSourceMs] = useState(clipStartMs);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);

  const setSourceTime = useCallback(
    (sourceMilliseconds: number) => {
      const clamped = clamp(sourceMilliseconds, clipStartMs, clipEndMs);
      sourceTimeRef.current = clamped;
      setCurrentSourceMs(clamped);
    },
    [clipEndMs, clipStartMs],
  );

  const seekSourceMs = useCallback(
    (sourceMilliseconds: number) => {
      const video = videoRef.current;
      const clamped = clamp(sourceMilliseconds, clipStartMs, clipEndMs);
      setSourceTime(clamped);
      if (video !== null) {
        video.currentTime = (clamped - clipStartMs) / 1_000;
      }
    },
    [clipEndMs, clipStartMs, setSourceTime],
  );

  const stepFrame = useCallback(
    (delta: -1 | 1) => {
      const video = videoRef.current;
      video?.pause();

      const currentFrame = sourceMillisecondsToFrame(
        sourceTimeRef.current,
        fps,
      );
      const firstFrame = sourceMillisecondsToFrame(clipStartMs, fps);
      const lastFrame = sourceMillisecondsToFrame(clipEndMs, fps);
      const targetFrame = clamp(
        currentFrame + delta,
        firstFrame,
        lastFrame,
      );
      seekSourceMs(frameToSourceMilliseconds(targetFrame, fps));
    },
    [clipEndMs, clipStartMs, fps, seekSourceMs],
  );

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    if (video.paused) {
      if (sourceTimeRef.current >= clipEndMs - 1) {
        seekSourceMs(clipStartMs);
      }
      await video.play();
    } else {
      video.pause();
    }
  }, [clipEndMs, clipStartMs, seekSourceMs]);

  const toggleMuted = useCallback(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video !== null) {
      video.playbackRate = rate;
    }
    setPlaybackRateState(rate);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    const onTimeUpdate = () => {
      const sourceMilliseconds = clamp(
        clipStartMs + Math.round(video.currentTime * 1_000),
        clipStartMs,
        clipEndMs,
      );
      setSourceTime(sourceMilliseconds);
      if (sourceMilliseconds >= clipEndMs) {
        video.pause();
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeked", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeked", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [clipEndMs, clipStartMs, setSourceTime]);

  return {
    videoRef,
    currentSourceMs,
    playing,
    muted,
    playbackRate,
    togglePlayback,
    seekSourceMs,
    stepFrame,
    toggleMuted,
    setPlaybackRate,
  };
}

