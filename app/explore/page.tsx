import { ClipExplorer } from "@/components/explore/clip-explorer.tsx";
import { listConfirmedExplorerClips } from "@/lib/track-c/repository.ts";
import { VIDEO_SOURCE_REFERENCES } from "@/lib/track-c/sources.ts";

export const dynamic = "force-dynamic";

export default function ExplorePage() {
  return (
    <ClipExplorer
      clips={listConfirmedExplorerClips()}
      sourceReferences={VIDEO_SOURCE_REFERENCES}
    />
  );
}
