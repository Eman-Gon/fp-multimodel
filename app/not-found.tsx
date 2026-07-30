import Link from "next/link";
import { DEMO_CLIP_ID } from "@/lib/track-c/seed.ts";

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <p className="not-found__code">404</p>
      <h1>That review item is not available.</h1>
      <p>The seeded Track C clip is still ready for review.</p>
      <Link href={`/clips/${DEMO_CLIP_ID}`} className="button button--primary">
        Open demo clip
      </Link>
    </main>
  );
}

