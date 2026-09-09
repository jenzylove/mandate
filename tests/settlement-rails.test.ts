import { describe, expect, it } from "vitest";
import { matchSettlementTerms } from "@/lib/settlement/rails";

const rail = {
  network: "bsc-mainnet" as const,
  chainId: 56,
  verifyingContract: "0xea4daa3100a767e86fded867729ae7446476eba6",
  paymentToken: "0xcE24439F2D9C6a2289F741120FE202248B666666",
};

describe("verified settlement rail matching", () => {
  it("accepts the existing allowlisted U rail", () => {
    expect(matchSettlementTerms({
      chainId: 56,
      verifyingContract: rail.verifyingContract,
      paymentToken: rail.paymentToken,
    }, rail)).toEqual({ compatible: true });
  });

  it("rejects IVL's USDT terms even though its verifier is the known contract", () => {
    const result = matchSettlementTerms({
      chainId: 56,
      verifyingContract: rail.verifyingContract,
      paymentToken: "0x55d398326f99059fF775485246999027B3197955",
    }, rail);
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/payment token/);
  });

  it("rejects a foreign verifier and chain", () => {
    const foreign = matchSettlementTerms({
      chainId: 56,
      verifyingContract: "0x2222222222222222222222222222222222222222",
    }, rail);
    expect(foreign.compatible).toBe(false);
    expect(foreign.reason).toMatch(/verifying contract/);

    const wrongChain = matchSettlementTerms({ chainId: 97 }, rail);
    expect(wrongChain.compatible).toBe(false);
    expect(wrongChain.reason).toMatch(/chain/);
  });

  it("can fill an omitted abstract token only from the verified rail", () => {
    expect(matchSettlementTerms({ chainId: 56 }, rail)).toEqual({ compatible: true });
  });
});
