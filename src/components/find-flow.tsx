"use client";
import { useState } from "react";
import Link from "next/link";
import type {
  Agent,
  Outcome,
  OutcomeQuery,
  GoalType,
  RiskLevel,
  ControlMode,
} from "@/lib/domain/types";
import { recommend } from "@/lib/engine/recommend";
import { goals } from "./market-ui";
const steps = ["goal", "context", "risk", "control", "recommendations"];
const labels = [
  "Your goal",
  "Your assets",
  "Your risk",
  "Your control",
  "Your matches",
];
export function FindFlow({
  step,
  params,
  outcomes,
  agents,
}: {
  step: string;
  params: Record<string, string | undefined>;
  outcomes: Outcome[];
  agents: Agent[];
}) {
  const index = steps.indexOf(step);
  const [goal, setGoal] = useState(
    goals.some((g) => g.id === params.goal) ? params.goal! : "earn",
  );
  const [asset, setAsset] = useState(params.asset ?? "");
  const [protocol, setProtocol] = useState(params.protocol ?? "");
  const [risk, setRisk] = useState(
    ["conservative", "balanced", "aggressive"].includes(params.risk ?? "")
      ? params.risk!
      : "balanced",
  );
  const [control, setControl] = useState(
    ["monitor", "ask", "autopilot"].includes(params.control ?? "")
      ? params.control!
      : "ask",
  );
  const query = new URLSearchParams();
  query.set("goal", goal);
  if (asset) query.set("asset", asset);
  if (protocol) query.set("protocol", protocol);
  query.set("risk", risk);
  query.set("control", control);
  if (
    params.outcome &&
    outcomes.some((o) => o.id === params.outcome && o.goalType === goal)
  )
    query.set("outcome", params.outcome);
  const href = (s: string) => `/find/${s}?${query}`;
  const titles = [
    "What should your money do?",
    "What are you working with?",
    "Find your comfort zone.",
    "How hands-on do you want to be?",
    "A little clarity for your next move.",
  ];
  const descriptions = [
    "Start with a goal. We’ll help you find agents that fit.",
    "Choose an asset and protocol, or leave either open to explore.",
    "Tell us your preference. All strategies carry risk, including loss of capital.",
    "You choose how much freedom your agents should have.",
    "Compare setups matched to your choices, with the reasoning in plain sight.",
  ];
  const q: OutcomeQuery = {
    goalType: goal as GoalType,
    asset: asset || undefined,
    protocol: protocol || undefined,
    risk: risk as RiskLevel,
    control: control as ControlMode,
  };
  const candidates = outcomes.filter(
    (o) =>
      (params.outcome
        ? o.id === params.outcome
        : o.goalType === goal ||
          (goal === "protect" && o.goalType === "combine")) &&
      (!asset || o.supportedAssets.includes(asset)) &&
      (!protocol || o.supportedProtocols.includes(protocol)),
  );
  const raw = candidates.flatMap((outcome) =>
    recommend({ query: q, outcome, agents }),
  );
  const seen = new Set<string>();
  const recs = [...raw]
    .sort(
      (a, b) => Number(b.mode === "balanced") - Number(a.mode === "balanced"),
    )
    .filter((r) => {
      const key =
        r.outcomeId +
        ":" +
        r.agents
          .map((a) => a.agentId)
          .sort()
          .join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return (
    <main className="flow-shell">
      <div className="flow-progress" aria-label={`Step ${index + 1} of 5`}>
        {labels.map((l, i) => (
          <span key={l} className={i <= index ? "done" : ""}>
            {i + 1}. {l}
          </span>
        ))}
      </div>
      <div className="flow-heading">
        <p className="eyebrow">FIND YOUR FIT · STEP {index + 1} OF 5</p>
        <h1>{titles[index]}</h1>
        <p>{descriptions[index]}</p>
      </div>
      <form action={`/find/${steps[index + 1] ?? "recommendations"}`}>
        {step !== "goal" && <input type="hidden" name="goal" value={goal} />}
        {step !== "context" && (
          <>
            <input type="hidden" name="asset" value={asset} />
            <input type="hidden" name="protocol" value={protocol} />
          </>
        )}
        {step !== "risk" && <input type="hidden" name="risk" value={risk} />}
        {step !== "control" && (
          <input type="hidden" name="control" value={control} />
        )}{" "}
        {query.get("outcome") && (
          <input type="hidden" name="outcome" value={query.get("outcome")!} />
        )}
        {step === "goal" && (
          <div className="flow-options">
            {goals.map((g) => (
              <label key={g.id} className="flow-option">
                <span className={`goal-icon ${g.tone}`}>{g.icon}</span>
                <span>
                  <strong>{g.label}</strong>
                  <small>{g.text}</small>
                </span>
                <input
                  type="radio"
                  name="goal"
                  value={g.id}
                  checked={goal === g.id}
                  onChange={() => setGoal(g.id)}
                />
              </label>
            ))}
          </div>
        )}
        {step === "context" && (
          <div className="panel">
            <div className="form-grid">
              <label className="field">
                Asset
                <select
                  name="asset"
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                >
                  <option value="">Any supported asset</option>
                  {["USDT", "USDC", "BNB", "CAKE"].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <small>We’ll match agents that support this asset.</small>
              </label>
              <label className="field">
                Protocol
                <select
                  name="protocol"
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                >
                  <option value="">Any supported protocol</option>
                  {["Venus", "PancakeSwap"].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <small>Already have a position? Choose its protocol.</small>
              </label>
            </div>
            <p className="flow-note">
              No wallet balance is read or assumed. You can explore without
              connecting.
            </p>
          </div>
        )}
        {step === "risk" && (
          <div className="flow-options">
            {[
              [
                "conservative",
                "Conservative",
                "Prioritize simpler strategies and lower risk exposure.",
                "◇",
              ],
              [
                "balanced",
                "Balanced",
                "Balance opportunities with a measured approach to risk.",
                "≋",
              ],
              [
                "aggressive",
                "Aggressive",
                "Accept more volatility in pursuit of opportunity.",
                "⌁",
              ],
            ].map(([id, t, d, icon]) => (
              <label className="flow-option" key={id}>
                <span className="goal-icon butter">{icon}</span>
                <span>
                  <strong>{t}</strong>
                  <small>{d}</small>
                </span>
                <input
                  type="radio"
                  name="risk"
                  value={id}
                  checked={risk === id}
                  onChange={() => setRisk(id)}
                />
              </label>
            ))}
          </div>
        )}
        {step === "control" && (
          <div className="flow-options">
            {[
              [
                "monitor",
                "Monitor only",
                "Watch and alert. No actions on your behalf.",
                "◉",
              ],
              [
                "ask",
                "Ask before acting",
                "Review proposed actions before anything happens.",
                "◇",
              ],
              [
                "autopilot",
                "Autopilot",
                "Let agents act within boundaries you would approve at activation.",
                "✳",
              ],
            ].map(([id, t, d, icon]) => (
              <label className="flow-option" key={id}>
                <span className="goal-icon mint">{icon}</span>
                <span>
                  <strong>{t}</strong>
                  <small>{d}</small>
                </span>
                <input
                  type="radio"
                  name="control"
                  value={id}
                  checked={control === id}
                  onChange={() => setControl(id)}
                />
              </label>
            ))}
          </div>
        )}
        {step === "recommendations" && (
          <>
            <div className="review-summary">
              <span>{goals.find((g) => g.id === goal)?.label}</span>
              <span>{asset || "Any asset"}</span>
              <span>{protocol || "Any protocol"}</span>
              <span>{risk} risk</span>
              <span>
                {control === "ask"
                  ? "Ask before acting"
                  : control === "monitor"
                    ? "Monitor only"
                    : "Autopilot"}
              </span>
            </div>
            <div className="notice">
              Demo recommendations, based on seeded agents and evidence. Fit
              scores indicate compatibility, not expected returns or safety
              guarantees.
              {goal === "protect"
                ? " The current catalog offers protection paired with yield; review both roles before choosing."
                : ""}
            </div>
            {recs.length ? (
              <div className="recommendation-grid">
                {recs.map((r) => (
                  <section className="panel" key={r.id}>
                    <p className="eyebrow">
                      {r.mode === "safe" ? "Safety-leaning" : r.mode} setup ·
                      Demo
                    </p>
                    <h2>{outcomes.find((o) => o.id === r.outcomeId)?.name}</h2>
                    <div className="fit-score">
                      {r.fitScore}
                      <small> / 100 fit</small>
                    </div>
                    {r.agents.map((a) => (
                      <div className="role-row" key={a.agentId}>
                        <Link href={`/agents/${a.agentId}`}>
                          {agents.find((x) => x.id === a.agentId)?.name} ↗
                        </Link>
                        <p>{a.role}</p>
                      </div>
                    ))}
                    <details className="reason-list">
                      <summary>Why this matches</summary>
                      {r.reasons.map((reason) => (
                        <p key={reason}>✓ {reason} · seeded assessment</p>
                      ))}
                      <p>
                        Risk is inferred from agent category; it is not an
                        audited risk rating.
                      </p>
                    </details>
                    <Link
                      className="button primary"
                      href={`/outcomes/create?${query}&outcome=${r.outcomeId}&mode=${r.mode}`}
                    >
                      Review setup ↗
                    </Link>
                  </section>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>No complete setup matches yet.</h2>
                <p>
                  Try another asset, protocol or control preference. We only
                  show setups when every required role has a compatible agent.
                </p>
                <Link className="button secondary" href={href("context")}>
                  Adjust my choices
                </Link>
              </div>
            )}
          </>
        )}
        <div className="flow-footer">
          <Link
            className="text-link"
            href={index ? href(steps[index - 1]) : "/outcomes"}
          >
            ← {index ? "Back" : "Browse outcomes"}
          </Link>
          {index < 4 ? (
            <button type="submit" className="button primary">
              {index === 3 ? "Show my matches" : "Continue"} →
            </button>
          ) : (
            <Link className="text-link" href="/find/goal">
              Start again
            </Link>
          )}
        </div>
      </form>
      <p className="flow-note">
        ◇ Your preferences stay in this flow. No funds move when you explore.
      </p>
    </main>
  );
}
