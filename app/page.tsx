import { redirect } from "next/navigation";
import { DEMO_CLIP_ID } from "@/lib/track-c/seed.ts";

export default function HomePage(): never {
  redirect(`/clips/${DEMO_CLIP_ID}`);
}

