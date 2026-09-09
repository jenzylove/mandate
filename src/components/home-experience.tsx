"use client";

import Link from "next/link";
import { AgentCard, GoalGlyph } from "./market-ui";
import type { Agent, Outcome } from "@/lib/domain/types";

const goalCopy = [
  ["↗", "Grow my money", "earn"],
  ["◇", "Protect my position", "protect"],
  ["⌁", "Trade with limits", "trade"],
  ["≋", "Keep liquidity working", "manage-liquidity"],
  ["✳", "Do a little of both", "combine"],
] as const;
function OutcomeProduct({ outcome }: { outcome: Outcome }) {
  const goalId = goalCopy.find((goal) => goal[2] === outcome.goalType)?.[2] ?? "combine";
  return (
    <article className="mh-outcome-card">
      <div className="mh-card-head">
        <span className={`mh-outcome-icon ${outcome.goalType}`}><GoalGlyph goal={goalId} size={25} /></span>
        <span className="mh-badge">{outcome.requiredRoles.length} specialist {outcome.requiredRoles.length === 1 ? "role" : "roles"}</span>
      </div>
      <h3>{outcome.name}</h3>
      <p>{outcome.description}</p>
      <div className="mh-tags">
        <span>{outcome.supportedProtocols.join(" · ")}</span>
        <span>{outcome.supportedAssets.join(" / ")}</span>
        <span>{outcome.riskLevel} risk</span>
      </div>
      <div className="mh-outcome-foot">
        <span>{outcome.requiredRoles.length} specialist {outcome.requiredRoles.length === 1 ? "role" : "roles"}</span>
        <Link href={`/outcomes/${outcome.id}`}>Explore setup ↗</Link>
      </div>
    </article>
  );
}
/**
 * One service per operator first, spread across categories, then fill.
 *
 * Every agent stays eligible; this only decides who is seen first.
 */
function previewSelection(agents: Agent[], size: number): Agent[] {
  const seenOperator = new Set<string>();
  const seenCategory = new Set<string>();
  const first: Agent[] = [];
  const rest: Agent[] = [];

  for (const a of agents) {
    const op = (a.owner || a.id).toLowerCase();
    if (!seenOperator.has(op) && !seenCategory.has(a.category)) {
      seenOperator.add(op);
      seenCategory.add(a.category);
      first.push(a);
    } else rest.push(a);
  }
  // Then any operator not yet shown, before a second service from one already on.
  const second = rest.filter((a) => !seenOperator.has((a.owner || a.id).toLowerCase()));
  for (const a of second) seenOperator.add((a.owner || a.id).toLowerCase());
  const filler = rest.filter((a) => !second.includes(a));

  return [...first, ...second, ...filler].slice(0, size);
}

export function HomeExperience({ outcomes, agents }: { outcomes: Outcome[]; agents: Agent[] }) {
  // Curate from the whole real catalogue; verification controls hiring, not visibility.
  const liveAgents = agents.filter((agent) => agent.source !== "seed");
  // A preview of the market, not the first ten rows of it. Taking the head of
  // the list showed whichever operator ranked highest five times over; this
  // leads with one service per operator, spread across categories, so the first
  // impression is the breadth of the marketplace. The full catalogue is /agents.
  const previewAgents = previewSelection(liveAgents, 12);
  const featured = outcomes;
  return (
    <main className="mh-home mh-wrap">
      <section className="mh-hero">
        <div className="mh-hero-copy">
          <div className="mh-eyebrow"><span className="mh-yellow-dot" />YOUR MONEY. YOUR MANDATE.</div>
          <h1>Put your money<br />on a <em>mission.</em></h1>
          <p>Browse outcomes. Compare the BNB agents that can help you get there. You set the boundaries.</p>
          <div className="mh-actions">
            <Link className="mh-button mh-purple" href="#marketplace">Explore marketplace <span>↓</span></Link>
            <Link className="mh-text-link" href="/agents">Meet the agents →</Link>
          </div>
          <small>Browse freely. Sign in when you’re ready to save.</small>
        </div>
        <div className="mh-hero-visual">
          <div className="mh-orbit" />
          <div className="mh-mission-card">
            <div className="mh-mission-top"><span>YOUR MISSION</span><b>Example setup</b></div>
            <div className="mh-mission-icon">◇</div><h3>Protect &amp; Earn</h3><p>Two specialists. One clear goal.</p>
            <div className="mh-mission-team"><div><i>P</i><span>Position monitor<small>Protect your position</small></span><b>◇</b></div><div><i>Y</i><span>Yield optimizer<small>Put stablecoins to work</small></span><b>↗</b></div></div>
            <div className="mh-mission-control"><span>◉</span> Ask before acting <b>✓</b></div>
          </div>
          <div className="mh-floating"><span>✦</span><div>Your goals. Your rules.<small>No funds move while you explore.</small></div></div>
        </div>
      </section>

      <section className="mh-section" id="marketplace">
        <div className="mh-section-title"><h2>What do you want your money to do?</h2><span>Start with you.</span></div>
        <div className="mh-goals">{goalCopy.map(([, label, id]) => <Link key={id} className="mh-goal" href={`/outcomes?goal=${id}`}><span><GoalGlyph goal={id} size={28} /></span><b>{label}</b></Link>)}</div>
      </section>

      <section className="mh-section">
        <div className="mh-section-title"><div><small>A CLEAR GOAL. THE RIGHT TEAM.</small><h2>Outcomes worth exploring.</h2></div><Link href="/outcomes">All outcomes ↗</Link></div>
        <div className="mh-outcomes">{featured.map((outcome) => <OutcomeProduct key={outcome.id} outcome={outcome} />)}</div>
      </section>

      <section className="mh-section mh-agent-section" id="agents">
        <div className="mh-section-title"><div><small>LIVE ON BNB CHAIN</small><h2>Find your kind of agent.</h2><p>Real roles. Clear costs. Room to choose.</p></div></div>
        <div className="agent-grid-dense mh-agent-preview" aria-label="Live agent marketplace preview">{previewAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>
        <div className="mh-agent-browse"><Link href="/agents" aria-label={`View all agents · ${agents.length} total`}>View all agents <span aria-hidden="true">↗</span></Link><span>{agents.length} listings in the marketplace</span></div>
      </section>

      <section className="mh-guidance"><span>✳</span><div><h2>Not sure what fits?</h2><p>Tell us your goal, assets, risk and control preferences. We’ll help narrow the marketplace.</p></div><Link className="mh-button mh-yellow" href="/find/goal">Find my setup ↗</Link></section>

      <section className="mh-build"><div><h2>Have a specialist of your own?</h2><p>Build with BNB Agent Studio.</p></div><Link href="/build-agent">Build your own agent ↗</Link></section>

    </main>
  );
}
