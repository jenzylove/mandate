import { NextResponse } from "next/server";
import { hire } from "@/lib/settlement/hire";
import { NegotiationRequiredError, TermsChangedError } from "@/lib/commerce/negotiate";
import type { Quote } from "@/lib/live/agent-adapter";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      agentId?: string;
      buyer?: string;
      outcomeId?: string;
      request?: string;
      params?: Record<string, unknown>;
      context?: Record<string, unknown>;
      expectedQuote?: Partial<Quote>;
      resumeJobId?: string;
    };
    if (!body.agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
    const receipt = await hire({
      agentId: body.agentId,
      buyer: body.buyer ?? null,
      outcomeId: body.outcomeId,
      request: body.request,
      params: body.params,
      context: body.context,
      expectedQuote: body.expectedQuote,
      resumeJobId: body.resumeJobId,
    });
    return NextResponse.json({ ok: true, receipt });
  } catch (e) {
    if (e instanceof NegotiationRequiredError || e instanceof TermsChangedError) {
      const result = e.result;
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          missingFields: result.missingFields,
          provider: result.provider,
          network: result.network,
          quote: result.quote
            ? {
                accepted: result.quote.accepted,
                provider: result.provider ?? result.quote.provider,
                priceRaw: result.quote.priceRaw,
                priceDisplay: result.quote.priceDisplay,
                currency: result.quote.currency,
                service: result.quote.service,
                deliverables: result.quote.deliverables,
                needs: result.quote.needs,
                chainId: result.quote.chainId,
                verifyingContract: result.quote.verifyingContract,
                paymentToken: result.quote.paymentToken,
                expiresAt: result.quote.expiresAt,
              }
            : undefined,
          error: e.message,
        },
        { status: e instanceof TermsChangedError ? 409 : 422 },
      );
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
