import { QueuePage } from "@/components/queue/queue-page.tsx";
import { getClipById, listClips } from "@/lib/track-c/repository.ts";
import { summarizeReview } from "@/lib/track-c/review.ts";

export const dynamic = "force-dynamic";

export default function CodingQueuePage() {
  const clips = listClips();
  const clipSummaries = Object.fromEntries(
    clips.map(({ id }) => {
      const clip = getClipById(id);
      if (clip === null) {
        throw new Error(`The demo review clip ${id} is unavailable.`);
      }
      return [id, summarizeReview(clip)];
    }),
  );

  return <QueuePage clips={clips} clipSummaries={clipSummaries} />;
}
