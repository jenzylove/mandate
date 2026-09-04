import Link from "next/link";
import type { Agent, Outcome, Evidence } from "@/lib/domain/types";
export const goals = [
  {
    id: "earn",
    label: "Earn",
    icon: "↗",
    text: "Put idle assets to work",
    tone: "mint",
  },
  {
    id: "protect",
    label: "Protect",
    icon: "◇",
    text: "Watch over your positions",
    tone: "peach",
  },
  {
    id: "trade",
    label: "Trade",
    icon: "⌁",
    text: "Trade with clear boundaries",
    tone: "lavender",
  },
  {
    id: "manage-liquidity",
    label: "Manage liquidity",
    icon: "≋",
    text: "Keep your liquidity working",
    tone: "blue",
  },
  {
    id: "combine",
    label: "Combine goals",
    icon: "✳",
    text: "Bring your goals together",
    tone: "butter",
  },
];
export const categoryNames: Record<string, string> = {
  "health-factor-monitoring": "Position protection",
  "yield-optimization": "Yield strategies",
  "grid-trading": "Trading strategies",
  rebalancing: "Liquidity management",
};
export const goalForCategory: Record<string, string> = {
  "health-factor-monitoring": "protect",
  "yield-optimization": "earn",
  "grid-trading": "trade",
  rebalancing: "manage-liquidity",
};
export function SymbolArt({
  goal,
  large = false,
}: {
  goal: string;
  large?: boolean;
}) {
  const g = goals.find((g) => g.id === goal) ?? goals[0];
  return (
    <div
      aria-hidden="true"
      className={`symbol-art ${g.tone} ${large ? "large" : ""}`}
    >
      <div className="art-orbit" />
      <div className="art-orbit second" />
      <span className="art-token">{g.icon}</span>
      <span className="art-spark">✦</span>
    </div>
  );
}
export function GoalShelf() {
  return (
    <div className="goal-shelf">
      {goals.map((g) => (
        <Link
          key={g.id}
          href={`/outcomes?goal=${g.id}`}
          className="goal-shortcut"
        >
          <span className={`goal-icon ${g.tone}`}>{g.icon}</span>
          <strong>{g.label}</strong>
          <small>{g.text}</small>
        </Link>
      ))}
      <Link className="goal-shortcut" href="/agents">
        <span className="goal-icon neutral">⊞</span>
        <strong>All agents</strong>
        <small>Explore the marketplace</small>
      </Link>
    </div>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  href,
  action = "View all",
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {action} ↗
        </Link>
      )}
    </div>
  );
}
export function OutcomeCard({ outcome: o }: { outcome: Outcome }) {
  return (
    <Link className="market-card" href={`/outcomes/${o.id}`}>
      <div className="card-art">
        <SymbolArt goal={o.goalType} />
        <span className="art-label">
          {o.requiredRoles.length} agent{" "}
          {o.requiredRoles.length === 1 ? "role" : "roles"}
        </span>
        <span className="corner-arrow">↗</span>
      </div>
      <div className="card-body">
        <p className="eyebrow">{o.supportedProtocols.join(" · ")}</p>
        <h3>{o.name}</h3>
        <p>{o.description}</p>
        <div className="card-bottom">
          <span className={`risk ${o.riskLevel}`}>{o.riskLevel}</span>
          <span className="demo-label">{o.evidence.provenance} evidence</span>
        </div>
      </div>
    </Link>
  );
}
export function AgentCard({ agent: a }: { agent: Agent }) {
  return (
    <Link className="agent-card" href={`/agents/${a.id}`}>
      <div className="agent-card-top">
        <span
          className={`agent-avatar ${goals.find((g) => g.id === goalForCategory[a.category])?.tone}`}
        >
          {a.name[0]}
        </span>
        <span className="demo-label">
          {a.source === "seed" ? "Demo agent" : a.evidence.provenance}
        </span>
      </div>
      <p className="eyebrow">{categoryNames[a.category]}</p>
      <h3>
        {a.name} <span>↗</span>
      </h3>
      <p>{a.description}</p>
      <div className="agent-protocols">{a.protocols.join(" · ")}</div>
      <div className="agent-fee">{a.pricing}</div>
      <div className="card-bottom">
        <span>
          Reputation {a.reputation}/100 · {a.evidence.provenance}
        </span>
        <span>{a.status}</span>
      </div>
    </Link>
  );
}
export function EvidencePanel({ evidence }: { evidence: Evidence }) {
  return (
    <section className="panel evidence">
      <p className="eyebrow">Transparent by design</p>
      <h2>Evidence, with context</h2>
      <p>
        {evidence.provenance === "demo"
          ? "These are seeded examples, not live results or projected returns."
          : `Source: ${evidence.provenance}`}
        {evidence.windowDays &&
          ` Observation window: ${evidence.windowDays} days.`}
      </p>
      <div className="metrics">
        {evidence.metrics.map((m) => (
          <div key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <small>{m.provenance} evidence</small>
          </div>
        ))}
      </div>
    </section>
  );
}
