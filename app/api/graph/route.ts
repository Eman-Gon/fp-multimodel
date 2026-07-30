import { listGraphDataset } from "@/lib/track-c/repository.ts";
import type { GraphScope } from "@/lib/track-c/graph.ts";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export function GET(request: Request): Response {
  const scope = new URL(request.url).searchParams.get("scope") ?? "confirmed";
  if (!isGraphScope(scope)) {
    return Response.json(
      {
        error: {
          code: "INVALID_GRAPH_SCOPE",
          message: "Graph scope must be either confirmed or demo.",
        },
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    { data: listGraphDataset(scope) },
    { headers: NO_STORE_HEADERS },
  );
}

function isGraphScope(value: string): value is GraphScope {
  return value === "confirmed" || value === "demo";
}
