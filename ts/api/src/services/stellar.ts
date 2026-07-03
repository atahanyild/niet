import { StrKey } from "@stellar/stellar-sdk";

export function strkeyContractToBytes32(strkey: string): `0x${string}` {
  const raw = StrKey.decodeContract(strkey);
  return `0x${Buffer.from(raw).toString("hex")}` as `0x${string}`;
}

export function bytes32ToStrkeyContract(bytes32: string): string {
  const clean = bytes32.startsWith("0x") ? bytes32.slice(2) : bytes32;
  const raw = Buffer.from(clean, "hex");
  return StrKey.encodeContract(raw);
}

/// Query Stellar events by intent_hash. Returns the first matching event's
/// tx hash + state discriminant. v1 placeholder — always returns null. Full
/// event indexing shipped in a follow-up (needs Soroban RPC getEvents call
/// with a topic filter which Cloudflare Workers can proxy).
export async function findSettlementEvent(
  _horizonUrl: string,
  _nietSettlerId: string,
  _intentHashHex: `0x${string}`,
): Promise<
  | {
      state: "settled" | "refunded" | "held";
      txHash: string;
    }
  | null
> {
  return null;
}
