import { afterEach, describe, expect, it, vi } from "vitest";
import { quote } from "@/lib/live/agent-adapter";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("live commerce protocol adapters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolves an A2A card URL and parses IVL's nested quote envelope", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        url: "https://ivl.example",
        preferredTransport: "JSONRPC",
      }))
      .mockResolvedValueOnce(jsonResponse({
        result: {
          parts: [{
            kind: "data",
            data: {
              response: {
                accepted: true,
                terms: {
                  price: "1000000000000000000",
                  currency: "0x55d398326f99059fF775485246999027B3197955",
                },
                quote_expires_at: 123,
              },
              chain_id: 56,
              verifying_contract: "0xea4daa3100a767e86fded867729ae7446476eba6",
              negotiation_hash: "0xnegotiation",
              provider_sig: "0xsig",
            },
          }],
        },
      }));

    const result = await quote(
      { kind: "A2A", endpoint: "https://ivl.example/.well-known/agent-card.json" },
      "Return a rebalance decision",
      undefined,
      { task_description: "Return a rebalance decision", quality_standards: "Include the decision." },
    );
    expect(result.accepted).toBe(true);
    expect(result.priceRaw).toBe("1000000000000000000");
    expect(result.paymentToken).toBe("0x55d398326f99059fF775485246999027B3197955");
    expect(result.chainId).toBe(56);
    expect(result.verifyingContract).toBe("0xea4daa3100a767e86fded867729ae7446476e ba6".replace(" ", ""));
    expect(result.negotiationHash).toBe("0xnegotiation");

    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    const data = request.params.message.parts[0].data;
    expect(data.task_description).toBe("Return a rebalance decision");
    expect(data.terms.quality_standards).toBe("Include the decision.");
  });

  it("falls back to an agent-named direct A2A skill", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { code: -32601, message: "Unknown skill. Available skills: preview." } }))
      .mockResolvedValueOnce(jsonResponse({ result: { decision: "hold", score: 0.4 } }));
    const result = await quote({ kind: "A2A", endpoint: "https://agent.example" }, "Preview this position");
    expect(result.accepted).toBe(true);
    expect(result.priceRaw).toBe("0");
    expect(result.service).toBe("preview");
    expect(result.deliverables).toContain("hold");
  });

  it("treats MCP tools as free callable supply", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      result: { tools: [{ name: "preview" }, { name: "health_factor" }] },
    }));
    const result = await quote({ kind: "MCP", endpoint: "https://agent.example/mcp" }, "Read this position");
    expect(result.accepted).toBe(true);
    expect(result.priceRaw).toBe("0");
    expect(result.deliverables).toContain("preview");
  });
});
