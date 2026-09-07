"use client";
import { useState } from "react";
import type { Agent } from "@/lib/domain/types";
import { goals, goalForCategory } from "./market-ui";

// The agent's own picture, from its ERC-8004 registration file.
//
// Remote images fail for ordinary reasons: a dead host, a hotlink block, a URL
// that was never an image. When that happens the monogram takes over, so a
// listing degrades to a clean initial rather than a broken-image icon. Nothing
// is ever substituted from another agent or invented.
export function AgentAvatar({ agent, size = "sm" }: { agent: Agent; size?: "sm" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const tone = goals.find((g) => g.id === goalForCategory[agent.category])?.tone ?? "";
  const showImage = Boolean(agent.image) && !failed;

  return (
    <span className={`agent-avatar ${tone} ${size === "lg" ? "is-lg" : ""}`}>
      {/* The monogram is always rendered and the image is laid over it, so a
          blocked, dead or still-loading image reveals the initial without
          waiting for an onError to fire after hydration. */}
      <span className="agent-avatar-initial">{agent.name[0]?.toUpperCase() ?? "?"}</span>
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote
        // hosts from onchain metadata cannot be enumerated for next/image.
        <img
          src={agent.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
