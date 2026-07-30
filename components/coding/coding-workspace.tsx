"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TimeRange } from "@/lib/types.ts";
import {
  applyClipCommand,
  listReviewUnits,
  ReviewCommandError,
  summarizeReview,
  targetKey,
} from "@/lib/track-c/review.ts";
import type {
  ClipCommand,
  ClipDetail,
  FieldReview,
  FieldTarget,
} from "@/lib/track-c/types.ts";
import { FieldInspector } from "./field-inspector.tsx";
import { TimelineEditor } from "./timeline-editor.tsx";
import { TranscriptContext } from "./transcript-context.tsx";
import { useClipPlayer } from "./use-clip-player.ts";
import { VideoPlayer } from "./video-player.tsx";

interface CodingWorkspaceProps {
  readonly initialClip: ClipDetail;
}

export function CodingWorkspace({ initialClip }: CodingWorkspaceProps) {
  const router = useRouter();
  const [clip, setClip] = useState(initialClip);
  const clipRef = useRef(initialClip);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const [saveState, setSaveState] = useState<
    "saved" | "saving" | "error"
  >("saved");
  const [liveMessage, setLiveMessage] = useState("");
  const firstUnresolved =
    listReviewUnits(initialClip).find(
      ({ field }) => field.state === "suggested",
    )?.target ?? { scope: "clip", field: "speaker_id" };
  const [activeTarget, setActiveTarget] =
    useState<FieldTarget>(firstUnresolved);
  const player = useClipPlayer({
    clipStartMs: clip.clip.start_ms,
    clipEndMs: clip.clip.end_ms,
    fps: clip.video.fps,
  });
  const summary = useMemo(() => summarizeReview(clip), [clip]);
  const particle = clip.particle_instances[0];

  const persistCommand = useCallback(
    (command: ClipCommand) => {
      pendingSavesRef.current += 1;
      setSaveState("saving");

      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch(`/api/clips/${clip.clip.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(command),
          });
          if (!response.ok) {
            const body = (await response.json()) as {
              error?: { message?: string };
            };
            throw new Error(
              body.error?.message ?? "The review action could not be saved.",
            );
          }
        })
        .catch((error: unknown) => {
          setSaveState("error");
          setLiveMessage(
            error instanceof Error ? error.message : "Save failed.",
          );
          throw error;
        })
        .finally(() => {
          pendingSavesRef.current -= 1;
          if (pendingSavesRef.current === 0) {
            setSaveState((current) =>
              current === "error" ? current : "saved",
            );
          }
        });
    },
    [clip.clip.id],
  );

  const runCommand = useCallback(
    (command: ClipCommand): ClipDetail | null => {
      try {
        const next = applyClipCommand(clipRef.current, command);
        clipRef.current = next;
        setClip(next);
        persistCommand(command);
        return next;
      } catch (error) {
        const message =
          error instanceof ReviewCommandError || error instanceof Error
            ? error.message
            : "The review action could not be applied.";
        setLiveMessage(message);
        return null;
      }
    },
    [persistCommand],
  );

  const reviewField = useCallback(
    (target: FieldTarget, review: FieldReview): ClipDetail | null =>
      runCommand({
        expected_version: clipRef.current.version,
        command: "review_field",
        target,
        review,
      }),
    [runCommand],
  );

  const focusTarget = useCallback((target: FieldTarget) => {
    setActiveTarget(target);
    requestAnimationFrame(() => {
      const key = targetKey(target);
      const row = document.querySelector<HTMLElement>(
        `[data-field-key="${CSS.escape(key)}"]`,
      );
      row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      row
        ?.querySelector<HTMLElement>(
          "select, button, input, [tabindex]:not([tabindex='-1'])",
        )
        ?.focus({ preventScroll: true });
    });
  }, []);

  const focusNextUnresolved = useCallback(
    (nextClip: ClipDetail, afterTarget = activeTarget) => {
      const units = listReviewUnits(nextClip);
      const currentIndex = units.findIndex(
        ({ target }) => targetKey(target) === targetKey(afterTarget),
      );
      const ordered = [
        ...units.slice(currentIndex + 1),
        ...units.slice(0, currentIndex + 1),
      ];
      const next = ordered.find(({ field }) => field.state === "suggested");
      if (next !== undefined) {
        focusTarget(next.target);
        setLiveMessage(`${next.label} is the next unreviewed field.`);
      }
    },
    [activeTarget, focusTarget],
  );

  const confirmActive = useCallback(() => {
    const active = listReviewUnits(clipRef.current).find(
      ({ target }) => targetKey(target) === targetKey(activeTarget),
    );
    if (active === undefined) {
      return;
    }
    if (active.field.state === "confirmed") {
      focusNextUnresolved(clipRef.current);
      return;
    }
    const next = reviewField(activeTarget, { action: "accept" });
    if (next !== null) {
      setLiveMessage(`${active.label} confirmed.`);
      focusNextUnresolved(next);
    }
  }, [activeTarget, focusNextUnresolved, reviewField]);

  const skipActive = useCallback(() => {
    const active = listReviewUnits(clipRef.current).find(
      ({ target }) => targetKey(target) === targetKey(activeTarget),
    );
    if (active === undefined || active.field.state !== "suggested") {
      return;
    }
    const next = reviewField(activeTarget, {
      action: "skip",
      reason: "Reviewer explicitly skipped this field.",
    });
    if (next !== null) {
      setLiveMessage(`${active.label} skipped.`);
      focusNextUnresolved(next);
    }
  }, [activeTarget, focusNextUnresolved, reviewField]);

  const navigateToQueue = useCallback(async () => {
    try {
      await saveQueueRef.current;
      router.push("/queue");
    } catch {
      setLiveMessage("Resolve the save error before leaving this clip.");
    }
  }, [router]);

  const confirmClip = useCallback(() => {
    const currentSummary = summarizeReview(clipRef.current);
    if (!currentSummary.ready || saveState === "saving") {
      const firstBlocking = currentSummary.blocking_fields[0];
      if (firstBlocking !== undefined) {
        focusTarget(firstBlocking);
      }
      setLiveMessage(
        currentSummary.remaining === 0
          ? "Wait for the current save to finish."
          : `${currentSummary.remaining} fields still need a human decision.`,
      );
      return;
    }

    const next = runCommand({
      expected_version: clipRef.current.version,
      command: "confirm_clip",
    });
    if (next !== null) {
      setLiveMessage("Clip confirmed. The reviewed coding is ready to store.");
    }
  }, [focusTarget, runCommand, saveState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === ",") {
        event.preventDefault();
        player.stepFrame(-1);
      } else if (key === ".") {
        event.preventDefault();
        player.stepFrame(1);
      } else if (key === "c") {
        event.preventDefault();
        confirmActive();
      } else if (key === "s") {
        event.preventDefault();
        skipActive();
      } else if (key === "n") {
        event.preventDefault();
        void navigateToQueue();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmActive, navigateToQueue, player, skipActive]);

  if (particle === undefined) {
    return (
      <main className="empty-review">
        <h1>No particle instances are available.</h1>
      </main>
    );
  }

  return (
    <main className="coding-workspace">
      <header className="workspace-bar">
        <div className="workspace-bar__brand">
          <strong>Final Particle Lab</strong>
          <span>{clip.fixture_note}</span>
        </div>
        <div className="workspace-bar__sequence">
          <button
            type="button"
            className="icon-button"
            aria-label="Back to coding queue"
            onClick={() => void navigateToQueue()}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div>
            <span>Clip 03 of 18</span>
            <small>{clip.clip.name}</small>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Next clip"
            onClick={() => void navigateToQueue()}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className={`button workspace-bar__confirm${summary.ready ? " button--primary" : " button--disabled"}`}
          aria-disabled={!summary.ready || saveState === "saving"}
          onClick={confirmClip}
        >
          {clip.clip.status === "confirmed" ? "Clip confirmed" : "Confirm clip"}
        </button>
      </header>

      <div className="coding-workspace__body">
        <div className="media-workbench">
          <VideoPlayer
            sourceUrl={clip.video.source_url}
            posterUrl={clip.video.poster_url}
            clipStartMs={clip.clip.start_ms}
            clipEndMs={clip.clip.end_ms}
            controller={player}
          />
          <TimelineEditor
            clipStartMs={clip.clip.start_ms}
            clipEndMs={clip.clip.end_ms}
            currentSourceMs={player.currentSourceMs}
            fps={clip.video.fps}
            particleTiming={particle.fields.fp_timing}
            gestureTiming={particle.fields.gesture_timing}
            onSeek={player.seekSourceMs}
            onActivate={(field) =>
              setActiveTarget({
                scope: "particle",
                instance_id: particle.instance_id,
                field,
              })
            }
            onCommit={(field, value: TimeRange) =>
              reviewField(
                {
                  scope: "particle",
                  instance_id: particle.instance_id,
                  field,
                },
                { action: "edit", value },
              )
            }
          />
          <TranscriptContext
            text={clip.utterance.text}
            particle={currentParticleToken(particle)}
          />
        </div>
        <FieldInspector
          clip={clip}
          activeTarget={activeTarget}
          summary={summary}
          saveState={saveState}
          onActivate={setActiveTarget}
          onReview={(target, review) => {
            reviewField(target, review);
          }}
          onConfirmClip={confirmClip}
        />
      </div>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
    </main>
  );
}

function currentParticleToken(
  particle: ClipDetail["particle_instances"][number],
): string {
  return particle.fields.fp_token.value ?? particle.fields.fp_token.suggestion.value;
}

