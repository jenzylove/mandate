import Link from "next/link";
import { AgentAvatar } from "./agent-avatar";
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
export function GoalGlyph({ goal, size = 24 }: { goal: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (goal === "earn") return <svg {...common}><path d="M5 17 17 5"/><path d="M8 5h9v9"/><path d="M4 20h16"/></svg>;
  if (goal === "protect") return <svg {...common}><path d="M12 3 19 6v5c0 4.5-2.9 8-7 10-4.1-2-7-5.5-7-10V6l7-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>;
  if (goal === "trade") return <svg {...common}><path d="M5 7h13"/><path d="m15 4 3 3-3 3"/><path d="M19 17H6"/><path d="m9 14-3 3 3 3"/></svg>;
  if (goal === "manage-liquidity") return <svg {...common}><path d="M4 17c4-6 7-6 10-2s5 3 6-1"/><path d="M4 7c4 6 7 6 10 2s5-3 6 1"/></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="m10.5 10.5 3 3"/><path d="m13.5 10.5-3 3"/></svg>;
}
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
      <span className="art-token"><GoalGlyph goal={g.id} size={large ? 42 : 28} /></span>
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
          <span className={`goal-icon ${g.tone}`}><GoalGlyph goal={g.id} /></span>
          <strong>{g.label}</strong>
          <small>{g.text}</small>
        </Link>
      ))}
      <Link className="goal-shortcut" href="/agents">
        <span className="goal-icon neutral"><GoalGlyph goal="combine" /></span>
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
        <span className="demo-label">{o.requiredRoles.length} specialist {o.requiredRoles.length === 1 ? "role" : "roles"}</span>
        </div>
      </div>
    </Link>
  );
}
export function AgentCard({ agent: a }: { agent: Agent }) {
  // A marketplace tile: who it is, what it does, what it costs. Everything
  // longer than a line belongs on the detail page. The whole tile is the link,
  // so any click anywhere opens the agent.
  // Capabilities are the agent's own skill ids, so they arrive as slugs like
  // "grid_viability". Shown as written words; never rewritten into something
  // the agent did not say.
  const capability = (a.capabilities[0] ?? a.category).replace(/[-_]+/g, " ").trim();
  const verification = a.verification ?? (a.hireable ? "verified-hireable" : a.status === "available" || a.status === "limited" ? "live" : "registered");
  const verificationLabel = a.hireable
    ? "Available now"
    : a.status === "offline"
      ? "Currently unavailable"
      : "Registered";
  return (
    <Link className="agent-card" href={`/agents/${a.id}`}>
      <div className="agent-card-top">
        <AgentAvatar agent={a} />
        <div className="agent-card-id">
          <h3>{a.name}</h3>
          <p className="eyebrow">{categoryNames[a.category]}</p>
        </div>
      </div>
      <p className="agent-card-line">{capability}</p>
      <div className="agent-card-foot">
        <span className="agent-fee">{a.pricing === "No price quoted" || a.pricing === "Price not verified" ? (a.status === "offline" ? "Unavailable" : "Quote on hire") : a.pricing}</span>
        <span className={`agent-dot ${a.status}`}>{verificationLabel}</span>
      </div>
    </Link>
  );
}
export function EvidencePanel({ evidence }: { evidence: Evidence }) {
  const template = evidence.provenance === "demo";
  return (
    <section className="panel evidence">
      <p className="eyebrow">Transparent by design</p>
      <h2>Evidence, with context</h2>
      <p>
        {template
          ? "This is an authored outcome template. Mandate does not present these figures as performance results."
          : `Source: ${evidence.provenance}`}
        {evidence.windowDays &&
          ` Observation window: ${evidence.windowDays} days.`}
      </p>
      <div className="metrics">
        {template ? (
          <div>
            <span>Live delivery evidence</span>
            <strong>Collected after activation</strong>
            <small>Not a performance claim</small>
          </div>
        ) : evidence.metrics.map((m) => (
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
