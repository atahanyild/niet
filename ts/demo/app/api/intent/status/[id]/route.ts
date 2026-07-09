import { NextRequest } from "next/server";

import { API_CONFIG } from "@/app/lib/api/config";
import { findSettlementEvent } from "@/app/lib/api/stellar";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const intentHash = id as `0x${string}`;
  const found = await findSettlementEvent(
    API_CONFIG.STELLAR_TESTNET_RPC,
    API_CONFIG.NIET_SETTLER_ID,
    intentHash,
  );
  if (!found) {
    return Response.json({ intentHash, state: "pending" });
  }
  return Response.json({
    intentHash,
    state: found.state,
    stellarTxHash: found.txHash,
    stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${found.txHash}`,
  });
}
