/**
 * Base-side helpers. Continuous event scanning (`scanOpenEvents`) is deferred to
 * Story 2 / continuous-relayer work — v1 uses one-shot mode driven by a burn
 * tx hash provided at invocation.
 */

import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import { log } from "./lib/logger.js";

// Typed as `unknown` at export boundary — internal callers cast to viem's
// PublicClient. Avoids `TS7056` (viem generates a massive inferred type that
// exceeds the compiler's serialization limit).
export function makeBaseClient(rpcUrl: string): unknown {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}

export async function healthCheck(rpcUrl: string): Promise<void> {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const bn = await client.getBlockNumber();
  log("info", "base health OK", { chain: baseSepolia.name, block: bn.toString() });
}
