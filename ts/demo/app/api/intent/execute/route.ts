import type { NextRequest } from "next/server";

import { API_CONFIG } from "@/app/lib/api/config";
import {
  ORDER_DATA_TYPE,
  computeIntentHashPacked,
  encodeOrderData,
  type Intent,
} from "@/app/lib/api/intent-hash";

export const runtime = "nodejs";

interface ExecuteRequest {
  intent: Intent;
  userBaseAddress: `0x${string}`;
}

export async function POST(req: NextRequest) {
  let body: ExecuteRequest;
  try {
    body = (await req.json()) as ExecuteRequest;
  } catch {
    return Response.json(
      { error: { code: "invalid_json", message: "Body must be JSON" } },
      { status: 400 },
    );
  }

  const { intent, userBaseAddress } = body;
  const orderData = encodeOrderData(intent, API_CONFIG.USDC_BASE_SEPOLIA);
  const intentHash = computeIntentHashPacked(
    API_CONFIG.BASE_SEPOLIA_CHAIN_ID,
    API_CONFIG.ORIGIN_SETTLER_ADDRESS,
    userBaseAddress,
    0n,
    orderData,
  );

  return Response.json({
    originSettlerAddress: API_CONFIG.ORIGIN_SETTLER_ADDRESS,
    intentHash,
    orderDataType: ORDER_DATA_TYPE,
    orderData,
    fillDeadline: Math.floor(Date.now() / 1000) + 3600,
    submissionHint: {
      approveUsdc: `cast send ${API_CONFIG.USDC_BASE_SEPOLIA} 'approve(address,uint256)' ${API_CONFIG.ORIGIN_SETTLER_ADDRESS} ${intent.amount} --rpc-url ${API_CONFIG.BASE_SEPOLIA_RPC}`,
      callOpen: `cast send ${API_CONFIG.ORIGIN_SETTLER_ADDRESS} 'open((uint32,bytes32,bytes))' '(<fillDeadline>,${ORDER_DATA_TYPE},${orderData})' --rpc-url ${API_CONFIG.BASE_SEPOLIA_RPC}`,
    },
  });
}
