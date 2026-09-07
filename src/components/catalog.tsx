"use client";
import { useState } from "react";
import type { Agent, Outcome } from "@/lib/domain/types";
import { AgentCard, OutcomeCard, goals, categoryNames } from "./market-ui";
export function Catalog({
  outcomes = [],
  agents = [],
  kind,
  initialQuery = "",
  initialFilter = "all",
}: {
  outcomes?: Outcome[];
  agents?: Agent[];
  kind: "outcomes" | "agents";
  initialQuery?: string;
  initialFilter?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const options =
    kind === "outcomes"
      ? goals.map((g) => [g.id, g.label])
      : Object.entries(categoryNames);
  const q = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(q);
  const os = outcomes.filter(
    (o) =>
      (filter === "all" ||
        o.goalType === filter ||
        (filter === "protect" && o.goalType === "combine")) &&
      matches(
        [
          o.name,
          o.description,
          ...o.supportedAssets,
          ...o.supportedProtocols,
        ].join(" "),
      ),
  );
  const as = agents.filter(
    (a) =>
      (filter === "all" || a.category === filter) &&
      matches(
        [
          a.name,
          a.description,
          ...a.assets,
          ...a.protocols,
          categoryNames[a.category],
        ].join(" "),
      ),
  );
  const count = kind === "outcomes" ? os.length : as.length;
  // Say how much of this is real rather than labelling the whole collection a demo.
  const liveCount = kind === "agents" ? as.filter((a) => a.source !== "seed").length : 0;
  const seededCount = kind === "agents" ? as.length - liveCount : 0;

  // Group into shelves in the order the categories are declared, so the page
  // reads the same way every time rather than following whatever the data did.
  const shelves = Object.keys(categoryNames)
    .map((c) => [c, as.filter((a) => a.category === c)] as const)
    .filter(([, rows]) => rows.length > 0);
  return (
    <div className="catalog">
      <div className="catalog-toolbar">
        <div className="chips" aria-label="Filter marketplace">
          <button
            className={`chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
          >
            All {kind}
          </button>
          {options.map(([id, label]) => (
            <button
              key={id}
              className={`chip ${filter === id ? "active" : ""}`}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="catalog-search"
          aria-label={`Search ${kind}`}
          placeholder={`Search ${kind}, assets, protocols…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="catalog-count" aria-live="polite">
        {count} {kind} to explore{liveCount > 0 ? ` · ${liveCount} live onchain` : ""}{seededCount > 0 ? ` · ${seededCount} seeded` : ""}
      </p>
      {count ? (
        kind === "agents" ? (
          // A marketplace is browsed the way a store is: a shelf per category,
          // scrolled sideways, so the whole catalogue is visible at a glance
          // instead of four cards filling the screen and the rest below the fold.
          <div className="catalog-shelves">
            {shelves.map(([category, rows]) => (
              <section className="catalog-shelf" key={category}>
                <div className="shelf-head">
                  <h2>{categoryNames[category as keyof typeof categoryNames] ?? category}</h2>
                  <span>{rows.length}</span>
                </div>
                <div
                  className="shelf-track"
                  tabIndex={0}
                  role="region"
                  aria-label={`${categoryNames[category as keyof typeof categoryNames] ?? category}, scroll sideways`}
                >
                  {rows.map((a) => <AgentCard key={a.id} agent={a} />)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="cards-grid">
            {os.map((o) => <OutcomeCard key={o.id} outcome={o} />)}
          </div>
        )
      ) : (
        <div className="empty-state">
          <h2>No matches just yet.</h2>
          <p>Try another goal or search for an asset like USDT.</p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
