import { resetDemoClips } from "@/lib/track-c/repository.ts";
import { summarizeReview } from "@/lib/track-c/review.ts";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(): Promise<Response> {
  const clips = resetDemoClips();

  return Response.json(
    {
      data: clips,
      review_summaries: clips.map((clip) => summarizeReview(clip)),
    },
    { headers: NO_STORE_HEADERS },
  );
}
