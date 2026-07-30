import { GraphExplorer } from "@/components/explore/graph-explorer.tsx";
import { listGraphDataset } from "@/lib/track-c/repository.ts";

export const dynamic = "force-dynamic";

export default function GraphExplorerPage() {
  return (
    <GraphExplorer
      demoDataset={listGraphDataset("demo")}
      confirmedDataset={listGraphDataset("confirmed")}
    />
  );
}
