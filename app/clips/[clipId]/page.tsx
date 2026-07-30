import { notFound } from "next/navigation";
import { CodingWorkspace } from "@/components/coding/coding-workspace.tsx";
import { getClipById } from "@/lib/track-c/repository.ts";

interface ClipPageProps {
  readonly params: Promise<{ clipId: string }>;
}

export default async function ClipPage({ params }: ClipPageProps) {
  const { clipId } = await params;
  const clip = getClipById(clipId);
  if (clip === null) {
    notFound();
  }
  return <CodingWorkspace initialClip={clip} />;
}

