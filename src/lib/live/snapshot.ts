import { promises as fs } from "node:fs";
import path from "node:path";
import type { LiveAgent } from "@/lib/live/qualify";
import { qualifyAll } from "@/lib/live/qualify";

// Resolving twelve agent cards and probing twelve endpoints takes tens of
// seconds. No visitor should ever wait for that, so a page render only ever
// reads a snapshot from disk. The snapshot is refreshed out of band: on a
// schedule in production, and opportunistically in the background when a
// request notices it has gone stale.

const SNAPSHOT = path.join(process.cwd(), "data", "live", "agents.json");

// How old a snapshot may be before a background refresh is kicked off, and how
// old before the UI stops calling it current.
export const STALE_AFTER_MS = 15 * 60 * 1000;
export const VERY_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export interface Snapshot {
  refreshedAt: string;
  network: string;
  agents: LiveAgent[];
}

let memo: { at: number; snap: Snapshot } | null = null;
let inflight: Promise<Snapshot> | null = null;
const MEMO_MS = 30_000;

export async function readSnapshot(): Promise<Snapshot | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.snap;
  try {
    const raw = await fs.readFile(SNAPSHOT, "utf8");
    const snap = JSON.parse(raw) as Snapshot;
    memo = { at: Date.now(), snap };
    return snap;
  } catch {
    return null;
  }
}

export async function writeSnapshot(): Promise<Snapshot> {
  // Collapse concurrent refreshes: twelve agents do not need probing twice.
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const agents = await qualifyAll();
      const snap: Snapshot = {
        refreshedAt: new Date().toISOString(),
        network: "bsc-mainnet",
        agents,
      };
      await fs.mkdir(path.dirname(SNAPSHOT), { recursive: true });
      await fs.writeFile(SNAPSHOT, JSON.stringify(snap, null, 2), "utf8");
      memo = { at: Date.now(), snap };
      return snap;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface Freshness {
  refreshedAt: string | null;
  ageMs: number | null;
  stale: boolean;
  veryStale: boolean;
  label: string;
}

const humanAge = (ms: number) => {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

export async function freshness(): Promise<Freshness> {
  const snap = await readSnapshot();
  if (!snap) {
    return {
      refreshedAt: null,
      ageMs: null,
      stale: true,
      veryStale: true,
      label: "Availability has not been checked yet",
    };
  }
  const ageMs = Date.now() - new Date(snap.refreshedAt).getTime();
  return {
    refreshedAt: snap.refreshedAt,
    ageMs,
    stale: ageMs > STALE_AFTER_MS,
    veryStale: ageMs > VERY_STALE_AFTER_MS,
    label: `Availability checked ${humanAge(ageMs)}`,
  };
}

/**
 * Serve what we have immediately, and refresh in the background if it has aged.
 * The caller never waits on the refresh.
 */
export async function liveAgents(): Promise<LiveAgent[]> {
  const snap = await readSnapshot();
  if (!snap) {
    // Nothing on disk at all: block once so the first visitor sees a market
    // rather than an empty page. Every later request is served from the file.
    return (await writeSnapshot()).agents;
  }
  const ageMs = Date.now() - new Date(snap.refreshedAt).getTime();
  if (ageMs > STALE_AFTER_MS && !inflight) {
    void writeSnapshot().catch(() => undefined);
  }
  return snap.agents;
}

export async function liveAgent(id: string): Promise<LiveAgent | null> {
  return (await liveAgents()).find((a) => a.id === id) ?? null;
}

export const snapshotPath = SNAPSHOT;
