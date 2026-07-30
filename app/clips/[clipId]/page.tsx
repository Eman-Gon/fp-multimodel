import { notFound } from "next/navigation";
import { CodingWorkspace } from "@/components/coding/coding-workspace.tsx";
import { getClipById, listClips } from "@/lib/track-c/repository.ts";

interface ClipPageProps {
  readonly params: Promise<{ clipId: string }>;
}

export default async function ClipPage({ params }: ClipPageProps) {
  const { clipId } = await params;
  const clip = getClipById(clipId);
  if (clip === null) {
    notFound();
  }

  const reviewQueue = listClips().filter(
    ({ status }) => status === "draft" || status === "in_review",
  );
  const currentIndex = reviewQueue.findIndex(({ id }) => id === clipId);
  const nextClip =
    currentIndex === -1
      ? reviewQueue[0]
      : reviewQueue.length > 1
      ? reviewQueue[(Math.max(currentIndex, 0) + 1) % reviewQueue.length]
      : undefined;

  return (
    <CodingWorkspace
      initialClip={clip}
      nextClipId={nextClip?.id ?? null}
      queuePosition={currentIndex === -1 ? null : currentIndex + 1}
      queueTotal={reviewQueue.length}
    />
  );
}
