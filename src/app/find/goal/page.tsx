import { FindFlow } from "@/components/find-flow";
import { data } from "@/lib/data/live-adapter";
export default async function Page({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const [outcomes, agents] = await Promise.all([
    data.listOutcomes(),
    data.listAgents(),
  ]);
  return (
    <FindFlow
      step="goal"
      params={searchParams}
      outcomes={outcomes}
      agents={agents}
    />
  );
}
