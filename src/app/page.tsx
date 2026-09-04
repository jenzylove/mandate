import { data } from "@/lib/data/json-adapter";
import { HomeExperience } from "@/components/home-experience";
export default async function Home() {
  const [outcomes, agents] = await Promise.all([data.listOutcomes(), data.listAgents()]);
  return <HomeExperience outcomes={outcomes} agents={agents} />;
}
