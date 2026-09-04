import { data } from "@/lib/data/live-adapter";
import { HomeExperience } from "@/components/home-experience";

// Availability is read live, so this page must not be baked at build time.
export const dynamic = "force-dynamic";
export default async function Home() {
  const [outcomes, agents] = await Promise.all([data.listOutcomes(), data.listAgents()]);
  return <HomeExperience outcomes={outcomes} agents={agents} />;
}
