"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { TimeRange } from "@/lib/types.ts";
import {
  listReviewUnits,
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
import { MeaningContext } from "./meaning-context.tsx";
import { TimelineEditor } from "./timeline-editor.tsx";
import { TranscriptContext } from "./transcript-context.tsx";
import { useClipPlayer } from "./use-clip-player.ts";
import { VideoPlayer } from "./video-player.tsx";

interface CodingWorkspaceProps {
  readonly initialClip: ClipDetail;
  readonly nextClipId: string | null;
  readonly queuePosition: number | null;
  readonly queueTotal: number;
}

export function CodingWorkspace({
  initialClip,
  nextClipId,
  queuePosition,
  queueTotal,
}: CodingWorkspaceProps) {
  const router = useRouter();
  const [clip, setClip] = useState(initialClip);
  const clipRef = useRef(initialClip);
  const activeRequestRef = useRef<Promise<ClipDetail | null>>(
    Promise.resolve(null),
  );
  const requestInFlightRef = useRef(false);
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
  const [activeParticleInstanceId, setActiveParticleInstanceId] = useState(
    firstUnresolved.scope === "particle"
      ? firstUnresolved.instance_id
      : (initialClip.particle_instances[0]?.instance_id ?? ""),
  );
  const player = useClipPlayer({
    clipStartMs: clip.clip.start_ms,
    clipEndMs: clip.clip.end_ms,
    fps: clip.video.fps,
  });
  const summary = useMemo(() => summarizeReview(clip), [clip]);
  const particle =
    clip.particle_instances.find(
      ({ instance_id }) => instance_id === activeParticleInstanceId,
    ) ?? clip.particle_instances[0];

  const loadCanonicalClip = useCallback(async (): Promise<ClipDetail | null> => {
    try {
      const response = await fetch(`/api/clips/${initialClip.clip.id}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as { data?: ClipDetail };
      if (body.data === undefined) {
        return null;
      }
      clipRef.current = body.data;
      setClip(body.data);
      return body.data;
    } catch {
      return null;
    }
  }, [initialClip.clip.id]);

  const runCommand = useCallback(
    async (command: ClipCommand): Promise<ClipDetail | null> => {
      if (requestInFlightRef.current) {
        setLiveMessage("Wait for the current review decision to save.");
        return null;
      }

      requestInFlightRef.current = true;
      setSaveState("saving");
      const request = (async () => {
        try {
          const response = await fetch(
            `/api/clips/${initialClip.clip.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(command),
            },
          );
          const body = (await response.json()) as {
            data?: ClipDetail;
            error?: { message?: string };
          };
          if (!response.ok || body.data === undefined) {
            throw new Error(
              body.error?.message ?? "The review action could not be saved.",
            );
          }

          clipRef.current = body.data;
          setClip(body.data);
          setSaveState("saved");
          return body.data;
        } catch (error) {
          setSaveState("error");
          const canonical = await loadCanonicalClip();
          setLiveMessage(
            `${error instanceof Error ? error.message : "Save failed."}${
              canonical === null ? "" : " The latest saved version was restored."
            }`,
          );
          return null;
        } finally {
          requestInFlightRef.current = false;
        }
      })();

      activeRequestRef.current = request;
      return request;
    },
    [initialClip.clip.id, loadCanonicalClip],
  );

  const reviewField = useCallback(
    async (
      target: FieldTarget,
      review: FieldReview,
    ): Promise<ClipDetail | null> => {
      if (clipRef.current.clip.status === "confirmed") {
        setLiveMessage(
          "This confirmed clip is read-only. Reset the demo from the queue to rehearse again.",
        );
        return null;
      }

      return await runCommand({
        expected_version: clipRef.current.version,
        command: "review_field",
        target,
        review,
      });
    },
    [runCommand],
  );

  const activateTarget = useCallback((target: FieldTarget) => {
    setActiveTarget(target);
    if (target.scope === "particle") {
      setActiveParticleInstanceId(target.instance_id);
    }
  }, []);

  const focusTarget = useCallback((target: FieldTarget) => {
    activateTarget(target);
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
  }, [activateTarget]);

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

  const confirmActive = useCallback(async () => {
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
    const next = await reviewField(activeTarget, { action: "accept" });
    if (next !== null) {
      setLiveMessage(`${active.label} confirmed.`);
      focusNextUnresolved(next);
    }
  }, [activeTarget, focusNextUnresolved, reviewField]);

  const skipActive = useCallback(async () => {
    const active = listReviewUnits(clipRef.current).find(
      ({ target }) => targetKey(target) === targetKey(activeTarget),
    );
    if (active === undefined || active.field.state !== "suggested") {
      return;
    }
    const next = await reviewField(activeTarget, {
      action: "skip",
      reason: "Reviewer explicitly skipped this field.",
    });
    if (next !== null) {
      setLiveMessage(`${active.label} skipped.`);
      focusNextUnresolved(next);
    }
  }, [activeTarget, focusNextUnresolved, reviewField]);

  const navigateToQueue = useCallback(async () => {
    await activeRequestRef.current;
    router.push("/queue");
    router.refresh();
  }, [router]);

  const navigateToNext = useCallback(async () => {
    await activeRequestRef.current;
    router.push(nextClipId === null ? "/queue" : `/clips/${nextClipId}`);
    router.refresh();
  }, [nextClipId, router]);

  const confirmClip = useCallback(async () => {
    if (clipRef.current.clip.status === "confirmed") {
      await navigateToNext();
      return;
    }
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

    const next = await runCommand({
      expected_version: clipRef.current.version,
      command: "confirm_clip",
    });
    if (next !== null) {
      setLiveMessage("Clip confirmed. The reviewed coding is ready to store.");
    }
  }, [focusTarget, navigateToNext, runCommand, saveState]);

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
        void confirmActive();
      } else if (key === "s") {
        event.preventDefault();
        void skipActive();
      } else if (key === "q") {
        event.preventDefault();
        void navigateToQueue();
      } else if (key === "n") {
        event.preventDefault();
        void navigateToNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    confirmActive,
    navigateToNext,
    navigateToQueue,
    player,
    skipActive,
  ]);

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
        <div className="workspace-bar__back">
          <button
            type="button"
            onClick={() => void navigateToQueue()}
          >
            <ChevronLeft aria-hidden="true" />
            Back to queue
          </button>
          <span className={`save-state save-state--${saveState}`}>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "error"
                ? "Save needs attention"
                : "All changes saved"}
          </span>
        </div>
        <div className="workspace-bar__sequence">
          <div>
            <span>
              {queuePosition === null
                ? "Reviewed clip"
                : `Clip ${queuePosition} of ${queueTotal}`}
            </span>
            <small>
              {summary.remaining === 0
                ? "Ready to confirm"
                : `${summary.remaining} review decisions left`}
            </small>
          </div>
        </div>
        <button
          type="button"
          className={`button workspace-bar__confirm${summary.ready || clip.clip.status === "confirmed" ? " button--primary" : " button--disabled"}`}
          aria-disabled={
            clip.clip.status !== "confirmed" &&
            (!summary.ready || saveState === "saving")
          }
          disabled={saveState === "saving"}
          onClick={
            clip.clip.status === "confirmed"
              ? () => void navigateToNext()
              : () => void confirmClip()
          }
        >
          {clip.clip.status === "confirmed"
            ? nextClipId === null
              ? "Return to queue"
              : "Next review clip"
            : "Confirm clip"}
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
            illustrative={clip.demo_fixture}
          />
          {clip.particle_instances.length > 1 ? (
            <nav
              className="particle-instance-tabs"
              aria-label="Particle instances in this clip"
            >
              {clip.particle_instances.map((instance, index) => {
                const selected =
                  instance.instance_id === particle.instance_id;
                return (
                  <button
                    type="button"
                    className={selected ? "is-selected" : undefined}
                    aria-pressed={selected}
                    onClick={() =>
                      focusTarget({
                        scope: "particle",
                        instance_id: instance.instance_id,
                        field: "fp_token",
                      })
                    }
                    key={instance.instance_id}
                  >
                    Particle {index + 1} · {currentParticleToken(instance)}
                  </button>
                );
              })}
            </nav>
          ) : null}
          <TimelineEditor
            clipStartMs={clip.clip.start_ms}
            clipEndMs={clip.clip.end_ms}
            currentSourceMs={player.currentSourceMs}
            fps={clip.video.fps}
            particleTiming={particle.fields.fp_timing}
            gesturePresent={particle.fields.gesture_present}
            gestureTiming={particle.fields.gesture_timing}
            disabled={clip.clip.status === "confirmed"}
            onSeek={player.seekSourceMs}
            onActivate={(field) =>
              activateTarget({
                scope: "particle",
                instance_id: particle.instance_id,
                field,
              })
            }
            onCommit={(field, value: TimeRange) => {
              void reviewField(
                {
                  scope: "particle",
                  instance_id: particle.instance_id,
                  field,
                },
                { action: "edit", value },
              );
            }}
          />
          <TranscriptContext
            text={clip.utterance.text}
            particle={currentParticleToken(particle)}
          />
          <details className="meaning-disclosure">
            <summary>Meaning evidence &amp; clip metadata</summary>
            <MeaningContext
              clip={clip}
              particleInstanceId={particle.instance_id}
            />
          </details>
        </div>
        <FieldInspector
          clip={clip}
          particleInstanceId={particle.instance_id}
          activeTarget={activeTarget}
          summary={summary}
          busy={saveState === "saving"}
          liveMessage={liveMessage}
          onActivate={activateTarget}
          onReview={(target, review) => {
            void reviewField(target, review);
          }}
        />
      </div>
    </main>
  );
}

function currentParticleToken(
  particle: ClipDetail["particle_instances"][number],
): string {
  return particle.fields.fp_token.value ?? particle.fields.fp_token.suggestion.value;
}
