import { getTwelveLabsConfigurationStatus } from "@/lib/twelvelabs/config.ts";
import { jsonData } from "@/lib/twelvelabs/route-support.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  return jsonData(getTwelveLabsConfigurationStatus());
}

