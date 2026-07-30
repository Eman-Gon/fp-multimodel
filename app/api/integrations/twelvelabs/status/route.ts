import { getTwelveLabsConfigurationStatus } from "@/lib/twelvelabs/config.ts";
import type { TwelveLabsStatusData } from "@/lib/twelvelabs/contracts.ts";
import { jsonData } from "@/lib/twelvelabs/route-support.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  const data = getTwelveLabsConfigurationStatus() satisfies TwelveLabsStatusData;
  return jsonData(data);
}
