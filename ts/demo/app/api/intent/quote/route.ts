import type { NextRequest } from "next/server";

import type { Intent } from "@/app/lib/api/intent-hash";

export const runtime = "nodejs";

interface QuoteRequest {
  intent: Intent;
  userBaseAddress: `0x${string}`;
}

interface ConditionPreview {
  tag: string;
  satisfiable: boolean;
  current?: string;
  note?: string;
}

export async function POST(req: NextRequest) {
  let body: QuoteRequest;
  try {
    body = (await req.json()) as QuoteRequest;
  } catch {
    return Response.json(
      { error: { code: "invalid_json", message: "Body must be JSON" } },
      { status: 400 },
    );
  }

  const { intent } = body;
  const now = Math.floor(Date.now() / 1000);
  const conditionPreview: ConditionPreview[] = intent.conditions.map((c) => {
    if (c.tag === "TimeBound") {
      const satisfiable = now <= c.maxStellarLedgerTs;
      return {
        tag: "TimeBound",
        satisfiable,
        current: String(now),
        note: satisfiable
          ? `Current unix time ${now} <= max ${c.maxStellarLedgerTs}`
          : `Current unix time ${now} exceeds max ${c.maxStellarLedgerTs}`,
      };
    }
    return {
      tag: "RateThreshold",
      satisfiable: true,
      note: "Pool APY read not wired in v1 REST. Relayer will evaluate at settlement.",
    };
  });

  const amountIn = BigInt(intent.amount);
  const cctpFee = BigInt(intent.maxFee);
  const amountOut = amountIn - cctpFee;

  return Response.json({
    amountInMicroUsdc: amountIn.toString(),
    amountOutMicroUsdc: amountOut.toString(),
    cctpFeeMicroUsdc: cctpFee.toString(),
    etaSeconds: { fast: 15, typical: 30, slow: 90 },
    conditionPreview,
  });
}
