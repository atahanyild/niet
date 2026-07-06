/**
 * Prewired demo intents. Each one exercises a specific settlement path:
 *   - happy  : conditions pass, Blend supply fires (deferred — Blend pool USDC issue)
 *   - refund : condition fails, Refund fallback bursts USDC back to Base
 *   - hold   : condition fails, Hold fallback drops USDC at user's Stellar addr
 *
 * Hold is the verified path per docs/testnet-verification.md. Others documented
 * as pending but included so reviewers can see what each variant looks like.
 */

import { NIET } from "@/app/config/niet";
import type { NietOrderInput } from "./orderData";

export type Demo = "happy" | "refund" | "hold";

export function buildDemoIntent(
  which: Demo,
  overrides?: { userStellarAddr?: string },
): NietOrderInput {
  const base = {
    amountMicroUsdc: "1000000", // 1 USDC
    maxFeeMicroUsdc: "500",
    pool: NIET.BLEND_POOL_STELLAR_TESTNET,
    requestType: 2, // SupplyCollateral
    userStellarAddr: overrides?.userStellarAddr ?? NIET.DAY_0_HOLD_TARGET,
  };
  if (which === "happy") {
    return {
      ...base,
      conditions: [
        {
          tag: "TimeBound",
          maxStellarLedgerTs: Math.floor(Date.now() / 1000) + 24 * 3600,
        },
      ],
      fallback: { tag: "Hold" },
    };
  }
  if (which === "refund") {
    return {
      ...base,
      conditions: [{ tag: "TimeBound", maxStellarLedgerTs: 0 }],
      fallback: {
        tag: "Refund",
        sourceDomain: 6,
        sourceRecipient:
          ("0x000000000000000000000000" +
            "28fD68Fe39bAB5850362E6357730F1Aaab5AD7fd") as `0x${string}`,
      },
    };
  }
  return {
    ...base,
    conditions: [{ tag: "TimeBound", maxStellarLedgerTs: 0 }],
    fallback: { tag: "Hold" },
  };
}
