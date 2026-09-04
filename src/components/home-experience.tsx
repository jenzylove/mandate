"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Agent, Outcome } from "@/lib/domain/types";

const goalCopy = [
  ["↗", "Grow my money", "earn"],
  ["◇", "Protect my position", "protect"],
  ["⌁", "Trade with limits", "trade"],
  ["≋", "Keep liquidity working", "manage-liquidity"],
  ["✳", "Do a little of both", "combine"],
] as const;
const categoryCopy: Record<string, [string, string]> = {
  "health-factor-monitoring": ["◇", "Position protection"],
  "yield-optimization": ["↗", "Stablecoin yield"],
  rebalancing: ["≋", "Liquidity management"],
  "grid-trading": ["⌁", "Trading with limits"],
};
const controlCopy: Record<string, string> = {
  monitor: "Monitor",
  ask: "Ask first",
  autopilot: "Autopilot",
};

function OutcomeProduct({ outcome }: { outcome: Outcome }) {
  const icon = goalCopy.find((goal) => goal[2] === outcome.goalType)?.[0] ?? "✳";
  return (
    <article className="mh-outcome-card">
      <div className="mh-card-head">
        <span className={`mh-outcome-icon ${outcome.goalType}`}>{icon}</span>
        <span className="mh-badge">{outcome.evidence.provenance} evidence</span>
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
function AgentSupplyCard({ agent, onInspect }: { agent: Agent; onInspect: () => void }) {
  const [icon, label] = categoryCopy[agent.category];
  const metric = agent.evidence.metrics[0];
  return (
    <article className={`mh-agent-card ${agent.category}`}>
      <div className="mh-agent-art">
        <span className="mh-supply-ring" />
        <span className="mh-agent-logo">{icon}</span>
        <span className="mh-agent-monogram">{agent.name[0]}</span>
        <span className={`mh-availability ${agent.status}`}>● {agent.status} · demo</span>
        <span className="mh-agent-kind">{label}</span>
      </div>
      <div className="mh-agent-body">
        <h3>{agent.name}</h3>
        <p>{agent.description}</p>
        <div className="mh-agent-protocol">
          <b>{agent.protocols.join(" · ")}</b>
          <span>{agent.assets.join(" / ")}</span>
        </div>
        <div className="mh-agent-evidence">
          <span>{metric.value} {metric.label}<small>{agent.evidence.windowDays}-day demo evidence</small></span>
          <strong>{agent.reputation}<small>/100 seeded reputation</small></strong>
        </div>
        <dl>
          <div><dt>Example fee</dt><dd>{agent.pricing}</dd></div>
          <div><dt>You choose the control</dt><dd>{agent.supportedControlModes.map((mode) => controlCopy[mode]).join(" · ")}</dd></div>
        </dl>
        <button className="mh-button mh-purple" onClick={onInspect}>Explore {agent.name} <span>↗</span></button>
      </div>
    </article>
  );
}

export function HomeExperience({ outcomes, agents }: { outcomes: Outcome[]; agents: Agent[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [paused, setPaused] = useState(false);
  const orderedAgentIds = ["guardian", "atlas-yield", "meridian-lp", "lattice-grid", "atlas-yield-conservative", "lattice-grid-tight"];
  const orderedAgents = [...agents].sort((a, b) => orderedAgentIds.indexOf(a.id) - orderedAgentIds.indexOf(b.id));
  const featured = ["protect-and-earn", "stablecoin-yield"].map((id) => outcomes.find((outcome) => outcome.id === id)).filter(Boolean) as Outcome[];
  const streamItems = [
    ["◇", "Guardian", "available on Venus", "demo"],
    ["↗", "Atlas Yield", "Venus + PancakeSwap", "seeded"],
    ["≋", "Meridian", "92% range uptime", "30-day demo"],
    ["⌁", "Lattice Tight", "limited availability", "demo"],
    ["◉", "2 protocols", "6 specialists to explore", ""],
  ];
  const scrollAgents = (direction: number) => trackRef.current?.scrollBy({ left: direction * 350, behavior: "smooth" });
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
            <div className="mh-mission-top"><span>YOUR MISSION</span><b>Demo setup</b></div>
            <div className="mh-mission-icon">◇</div><h3>Protect &amp; Earn</h3><p>Two specialists. One clear goal.</p>
            <div className="mh-mission-team"><div><i>G</i><span>Guardian<small>Protect your position</small></span><b>◇</b></div><div><i>A</i><span>Atlas Yield Stable<small>Put stablecoins to work</small></span><b>↗</b></div></div>
            <div className="mh-mission-control"><span>◉</span> Ask before acting <b>✓</b></div>
          </div>
          <div className="mh-floating"><span>✦</span><div>Your goals. Your rules.<small>No funds move while you explore.</small></div></div>
        </div>
      </section>

      <section className={`mh-market-strip ${paused ? "paused" : ""}`} aria-label="Demo market inventory highlights">
        <div className="mh-stream-label"><span className="mh-yellow-dot" /><b>MARKET PULSE</b><small>Demo snapshot</small></div>
        <div className="mh-stream-window"><div className="mh-stream-track">{[false, true].map((copy) => <div key={String(copy)} aria-hidden={copy || undefined}>{streamItems.map(([icon, name, detail, source]) => <span key={`${copy}-${name}`}><i>{icon}</i><b>{name}</b> {detail}{source && <small>{source}</small>}</span>)}</div>)}</div></div>
        <button className="mh-stream-toggle" aria-label={paused ? "Resume market strip" : "Pause market strip"} onClick={() => setPaused((value) => !value)}>{paused ? "▷" : "Ⅱ"}</button>
      </section>

      <section className="mh-section" id="marketplace">
        <div className="mh-section-title"><h2>What do you want your money to do?</h2><span>Start with you.</span></div>
        <div className="mh-goals">{goalCopy.map(([icon, label, id]) => <Link key={id} className="mh-goal" href={`/outcomes?goal=${id}`}><span>{icon}</span><b>{label}</b></Link>)}</div>
      </section>

      <section className="mh-section">
        <div className="mh-section-title"><div><small>A CLEAR GOAL. THE RIGHT TEAM.</small><h2>Outcomes worth exploring.</h2></div><Link href="/outcomes">All outcomes ↗</Link></div>
        <div className="mh-outcomes">{featured.map((outcome) => <OutcomeProduct key={outcome.id} outcome={outcome} />)}</div>
        <div className="mh-more-outcomes"><span>More ways forward</span><Link href="/outcomes/stay-in-range">≋ Stay In Range <b>↗</b></Link><Link href="/outcomes/trade-with-guardrails">⌁ Trade With Guardrails <b>↗</b></Link></div>
      </section>

      <section className="mh-section mh-agent-section" id="agents">
        <div className="mh-section-title"><div><small>THE SPECIALISTS BEHIND YOUR NEXT MOVE</small><h2>Find your kind of agent.</h2><p>Real roles. Clear costs. Room to choose.</p></div><div className="mh-carousel-nav"><span>{agents.length} demo agents</span><button onClick={() => scrollAgents(-1)} aria-label="Previous agents">←</button><button className="next" onClick={() => scrollAgents(1)} aria-label="Next agents">→</button></div></div>
        <div className="mh-agent-track" ref={trackRef} tabIndex={0} role="region" aria-label="Browse agents horizontally">{orderedAgents.map((agent) => <AgentSupplyCard key={agent.id} agent={agent} onInspect={() => setSelectedAgent(agent)} />)}</div>
        <div className="mh-carousel-caption"><span>Swipe or scroll to meet more specialists →</span><span>Seeded inventory · Availability is illustrative</span></div>
      </section>

      <section className="mh-guidance"><span>✳</span><div><h2>Not sure what fits?</h2><p>Tell us your goal, assets, risk and control preferences. We’ll help narrow the marketplace.</p></div><Link className="mh-button mh-yellow" href="/find/goal">Find my setup ↗</Link></section>

      <section className="mh-build"><div><h2>Have a specialist of your own?</h2><p>Build with BNB Agent Studio.</p></div><Link href="/build-agent">Build your own agent ↗</Link></section>

      {selectedAgent && <div className="mh-modal-backdrop" role="presentation" onMouseDown={() => setSelectedAgent(null)}><section className="mh-agent-modal" role="dialog" aria-modal="true" aria-labelledby="agent-modal-title" onMouseDown={(event) => event.stopPropagation()}><button aria-label="Close details" onClick={() => setSelectedAgent(null)}>×</button><p className="mh-eyebrow">AGENT DETAILS · DEMO LISTING</p><div className="mh-modal-title"><h2 id="agent-modal-title">{selectedAgent.name}</h2><span className={`mh-availability ${selectedAgent.status}`}>● {selectedAgent.status} · demo</span></div><p>{selectedAgent.description}</p><dl><div><dt>Example fee</dt><dd>{selectedAgent.pricing}</dd></div><div><dt>Protocols &amp; assets</dt><dd>{selectedAgent.protocols.join(" / ")} · {selectedAgent.assets.join(" / ")}</dd></div><div><dt>Supported control</dt><dd>{selectedAgent.supportedControlModes.map((mode) => controlCopy[mode]).join(" · ")}</dd></div></dl><div className="mh-modal-evidence"><strong>Evidence · {selectedAgent.evidence.provenance} · {selectedAgent.evidence.windowDays} days</strong>{selectedAgent.evidence.metrics.map((metric) => <p key={metric.label}><span>{metric.label}</span><b>{metric.value}<small>{metric.provenance}</small></b></p>)}<small>Seeded sample, not a live result or projected return.</small></div><div className="mh-modal-note">No agent is activated here. Availability and evidence are seeded. Live execution is not integrated.</div><Link className="mh-button mh-purple" href={`/agents/${selectedAgent.id}`}>Open agent profile ↗</Link></section></div>}
    </main>
  );
}
