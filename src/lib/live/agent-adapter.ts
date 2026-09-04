import type { Route } from "@/lib/live/discover";

// The one adapter every live agent goes through. Two transports, verified
// against real agents on BNB Chain:
//
//   A2A  - JSON-RPC message/send. The providers that price their work dispatch
//          on a structured `data` part carrying {skill, terms}; a plain text
//          part only ever returns the catalogue. `negotiate` yields a quote,
//          `notify_funded` tells the seller an escrow job is funded.
//   MCP  - streamable HTTP JSON-RPC: initialize, tools/list, tools/call.
//
// Everything above this file talks in Quote and Delivery, never in transport.

export interface Quote {
  accepted: boolean;
  provider?: string;      // address that must be named as the job's provider
  priceRaw?: string;      // payment-token base units
  priceDisplay?: string;
  currency?: string;
  service?: string;
  category?: string;
  deliverables?: string;
  needs?: Record<string, string>;
  chainId?: number;
  verifyingContract?: string;
  paymentToken?: string;
  estimatedSeconds?: number;
  instructions?: string;
  raw: unknown;
}

export interface Delivery {
  ok: boolean;
  text: string;
  raw: unknown;
}

export interface ProbeResult {
  ok: boolean;
  detail: string;
  skills?: string[];
  tools?: string[];
  checkedAt: string;
}

const TIMEOUT = 25_000;

async function jsonRpc(url: string, method: string, params: unknown, accept = "application/json") {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept },
    signal: AbortSignal.timeout(TIMEOUT),
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 160)}`);
  if (!text.trim()) return {};
  // Some MCP servers answer with an SSE frame rather than a JSON body.
  if (text.startsWith("event:") || text.startsWith("data:")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    return line ? JSON.parse(line.slice(5).trim()) : {};
  }
  return JSON.parse(text);
}

// ---------------------------------------------------------------- A2A ------

const a2aMessage = (parts: unknown[]) => ({
  message: { kind: "message", role: "user", messageId: crypto.randomUUID(), parts },
});

// Sellers disagree about where arguments live: some read them from `terms`,
// some from the top level of the data part beside the skill. Sending both
// satisfies either convention without hard-coding anything per agent.
async function a2aSkill(url: string, skill: string, terms: Record<string, unknown>) {
  return jsonRpc(
    url,
    "message/send",
    a2aMessage([{ kind: "data", data: { skill, ...terms, terms } }]),
  );
}

// notify_funded takes job_id at the top level of the data part, beside the
// skill, rather than nested under terms the way negotiate does.
async function a2aNotify(url: string, jobId: string, extra: Record<string, unknown>) {
  return jsonRpc(url, "message/send", a2aMessage([
    { kind: "data", data: { skill: "notify_funded", job_id: jobId, terms: extra } },
  ]));
}

// Some sellers do not implement the negotiate/notify_funded pattern at all and
// expose their work as a single named skill. They say so in the error, so read
// it rather than writing the agent off.
const SKILL_HINT = /this agent has one:\s*"([^"]+)"|available skills?:\s*([^.]+)/i;

function skillsFromError(message: string): string[] {
  const m = SKILL_HINT.exec(message);
  if (!m) return [];
  const raw = m[1] ?? m[2] ?? "";
  return raw
    .split(/[,\s]+/)
    .map((s) => s.replace(/["'.]/g, "").trim())
    .filter(Boolean);
}

function readQuote(result: Record<string, unknown> | undefined, raw: unknown): Quote {
  if (!result) return { accepted: false, raw };
  return {
    accepted: result.accepted === true,
    provider: typeof result.provider === "string" ? result.provider : undefined,
    priceRaw: typeof result.price === "string" ? result.price : undefined,
    priceDisplay: typeof result.price_display === "string" ? result.price_display : undefined,
    currency: typeof result.currency === "string" ? result.currency : undefined,
    service: typeof result.service === "string" ? result.service : undefined,
    category: typeof result.category === "string" ? result.category : undefined,
    deliverables: typeof result.deliverables === "string" ? result.deliverables : undefined,
    needs: (result.needs as Record<string, string>) ?? undefined,
    chainId: typeof result.chain_id === "number" ? result.chain_id : undefined,
    verifyingContract:
      typeof result.verifying_contract === "string" ? result.verifying_contract : undefined,
    paymentToken: typeof result.payment_token === "string" ? result.payment_token : undefined,
    estimatedSeconds:
      typeof result.estimated_completion_seconds === "number"
        ? result.estimated_completion_seconds
        : undefined,
    instructions: typeof result.instructions === "string" ? result.instructions : undefined,
    raw,
  };
}

// ---------------------------------------------------------------- MCP ------

async function mcpInit(url: string) {
  const res = await jsonRpc(url, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mandate", version: "1.0.0" },
  }, "application/json, text/event-stream");
  return (res as { result?: { serverInfo?: { name?: string; version?: string } } }).result?.serverInfo;
}

async function mcpTools(url: string) {
  const res = await jsonRpc(url, "tools/list", {}, "application/json, text/event-stream");
  return ((res as { result?: { tools?: { name: string; description?: string }[] } }).result?.tools ?? []);
}

// ------------------------------------------------------------- public ------

/** Is this agent answering right now? Never throws; a failure is a result. */
export async function probe(route: Route): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  const url = route.endpoint;
  if (!url || url.startsWith("onchain")) {
    return { ok: false, detail: "on-chain rail, nothing to probe", checkedAt };
  }
  try {
    if (route.kind === "MCP") {
      const info = await mcpInit(url);
      if (!info) return { ok: false, detail: "no serverInfo in initialize", checkedAt };
      const tools = await mcpTools(url).catch(() => []);
      return {
        ok: true,
        detail: `MCP ${info.name ?? "server"}@${info.version ?? "?"}, ${tools.length} tools`,
        tools: tools.map((t) => t.name),
        checkedAt,
      };
    }
    if (route.kind === "A2A") {
      // A card URL answers GET; a service endpoint answers JSON-RPC.
      if (url.endsWith(".json")) {
        const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
        if (!r.ok) return { ok: false, detail: `agent card HTTP ${r.status}`, checkedAt };
        const card = (await r.json()) as { skills?: { id?: string; name?: string }[]; status?: string; presence?: string };
        if (card.status && card.status !== "BOUND")
          return { ok: false, detail: `${card.status} / ${card.presence ?? "unknown"}`, checkedAt };
        const skills = (card.skills ?? []).map((s) => s.id ?? s.name ?? "").filter(Boolean);
        return {
          ok: skills.length > 0,
          detail: skills.length ? `agent card serves ${skills.length} skills` : "agent card names no skills",
          skills,
          checkedAt,
        };
      }
      const res = (await a2aSkill(url, "negotiate", { deliverables: "availability probe" })) as {
        result?: Record<string, unknown>;
        error?: { code: number; message: string };
      };
      if (res.error) {
        // An agent that names its own skill is answering, just in a different
        // vocabulary. That is supply, not a failure.
        const offered = skillsFromError(res.error.message);
        if (offered.length)
          return {
            ok: true,
            detail: `answered, serves ${offered.join(", ")}`,
            skills: offered,
            checkedAt,
          };
        return { ok: false, detail: `JSON-RPC ${res.error.code}`, checkedAt };
      }
      const services = (res.result?.services as unknown[]) ?? [];
      const accepted = res.result?.accepted === true;
      return {
        ok: true,
        detail: accepted
          ? "answered and quoted a price"
          : `answered, ${services.length} services listed`,
        checkedAt,
      };
    }
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    return { ok: r.ok, detail: `HTTP ${r.status}`, checkedAt };
  } catch (e) {
    const err = e as Error;
    return { ok: false, detail: err.name === "TimeoutError" ? "timed out" : err.message.slice(0, 90), checkedAt };
  }
}

/** Ask the agent what it would charge for this work. */
export async function quote(
  route: Route,
  deliverables: string,
  serviceId?: string,
  params: Record<string, unknown> = {},
): Promise<Quote> {
  const url = route.endpoint;
  if (!url || url.startsWith("onchain")) return { accepted: false, raw: null };

  if (route.kind === "A2A" && !url.endsWith(".json")) {
    const res = (await a2aSkill(url, "negotiate", {
      deliverables,
      ...params,
      ...(serviceId ? { service_id: serviceId } : {}),
    })) as { result?: Record<string, unknown>; error?: { message: string } };

    // Retry under the agent's own skill name when it does not speak negotiate.
    if (res.error) {
      const offered = skillsFromError(res.error.message);
      const pick = serviceId && offered.includes(serviceId) ? serviceId : offered[0];
      if (pick) {
        const direct = (await a2aSkill(url, pick, { deliverables, ...params })) as {
          result?: Record<string, unknown>;
          error?: { message: string };
        };
        // A direct skill that returns work rather than a price is free supply.
        if (direct.result && direct.result.accepted === undefined)
          return {
            accepted: true,
            priceRaw: "0",
            priceDisplay: "No charge",
            currency: "U",
            service: pick,
            deliverables: JSON.stringify(direct.result).slice(0, 4000),
            raw: direct.result,
          };
        return readQuote(direct.result, direct);
      }
    }
    return readQuote(res.result, res);
  }

  // MCP agents publish no price today: their tools are free reads.
  if (route.kind === "MCP") {
    const tools = await mcpTools(url).catch(() => []);
    return {
      accepted: tools.length > 0,
      priceRaw: "0",
      priceDisplay: "No charge",
      currency: "U",
      deliverables: `Read-only MCP tools: ${tools.slice(0, 6).map((t) => t.name).join(", ")}`,
      raw: tools,
    };
  }
  return { accepted: false, raw: null };
}

/** Tell an A2A seller that its escrow job is funded, and collect the result. */
export async function notifyFunded(route: Route, jobId: string, params: Record<string, unknown> = {}): Promise<Delivery> {
  const url = route.endpoint;
  if (!url || route.kind !== "A2A" || url.endsWith(".json"))
    return { ok: false, text: "agent does not accept funded-job notifications", raw: null };
  try {
    const res = (await a2aNotify(url, jobId, params)) as {
      result?: unknown;
      error?: { message: string };
    };
    // A refusal is a real protocol answer worth recording verbatim, not a bug.
    if (res.error) return { ok: false, text: res.error.message, raw: res };
    return { ok: true, text: JSON.stringify(res.result, null, 2), raw: res.result };
  } catch (e) {
    return { ok: false, text: (e as Error).message, raw: null };
  }
}

/** Run a read-only MCP tool and return its text output. */
export async function callTool(route: Route, name: string, args: Record<string, unknown>): Promise<Delivery> {
  const url = route.endpoint;
  if (!url || route.kind !== "MCP") return { ok: false, text: "not an MCP agent", raw: null };
  try {
    const res = (await jsonRpc(url, "tools/call", { name, arguments: args }, "application/json, text/event-stream")) as {
      result?: { content?: { text?: string }[]; isError?: boolean };
      error?: { message: string };
    };
    if (res.error) return { ok: false, text: res.error.message, raw: res };
    const text = (res.result?.content ?? []).map((c) => c.text ?? "").join("\n").trim();
    return { ok: !res.result?.isError, text, raw: res.result };
  } catch (e) {
    return { ok: false, text: (e as Error).message, raw: null };
  }
}

export { mcpTools };
