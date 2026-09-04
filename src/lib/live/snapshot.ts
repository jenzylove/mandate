import { promises as fs } from "node:fs";
import path from "node:path";
import type { LiveAgent } from "@/lib/live/qualify";
import { qualifyAll } from "@/lib/live/qualify";

// Resolving twelve agent cards and probing twelve endpoints takes tens of
// seconds, which is far too slow for a page render. So the marketplace reads a
// snapshot on disk, refreshed out of band, and falls back to an empty live set
// (seed only, clearly labelled) if no snapshot exists yet.

const SNAPSHOT = path.join(process.cwd(), "data", "live", "agents.json");

export interface Snapshot {
  refreshedAt: string;
  network: string;
  agents: LiveAgent[];
  errors?: string[];
}

let memo: { at: number; snap: Snapshot } | null = null;
const MEMO_MS = 60_000;

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
}

export async function liveAgents(): Promise<LiveAgent[]> {
  return (await readSnapshot())?.agents ?? [];
}

export async function liveAgent(id: string): Promise<LiveAgent | null> {
  return (await liveAgents()).find((a) => a.id === id) ?? null;
}

export const snapshotPath = SNAPSHOT;
