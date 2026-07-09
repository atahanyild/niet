import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from "viem";

import { strkeyContractToBytes32 } from "./stellar";

export const ORDER_DATA_TYPE = keccak256(toHex("NietOrderDataV1"));

export interface Intent {
  amount: string;
  maxFee: string;
  userStellarAddr: string;
  action: { tag: "BlendSupply"; pool: string; requestType: number };
  fallback:
    | { tag: "Refund"; sourceDomain: number; sourceRecipient: string }
    | { tag: "Hold" };
  conditions: Array<
    | { tag: "RateThreshold"; pool: string; minApyBps: number }
    | { tag: "TimeBound"; maxStellarLedgerTs: number }
  >;
}

export function encodeOrderData(
  intent: Intent,
  usdc: `0x${string}`,
  nonce: bigint,
): `0x${string}` {
  const action = {
    tag: 0,
    pool: strkeyContractToBytes32(intent.action.pool),
    requestType: intent.action.requestType,
  };

  const fbk =
    intent.fallback.tag === "Refund"
      ? {
          tag: 0,
          sourceDomain: intent.fallback.sourceDomain,
          sourceRecipient: intent.fallback.sourceRecipient as `0x${string}`,
        }
      : {
          tag: 1,
          sourceDomain: 0,
          sourceRecipient:
            "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        };

  const conditions = intent.conditions.map((c) =>
    c.tag === "RateThreshold"
      ? {
          tag: 0,
          pool: strkeyContractToBytes32(c.pool),
          minApyBps: c.minApyBps,
          maxStellarLedgerTs: 0n,
        }
      : {
          tag: 1,
          pool:
            "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
          minApyBps: 0,
          maxStellarLedgerTs: BigInt(c.maxStellarLedgerTs),
        },
  );

  return encodeAbiParameters(
    parseAbiParameters([
      "(address inputToken,uint256 amount,uint256 maxFee,bytes32 userStellarAddr,uint256 nonce,(uint8 tag,bytes32 pool,uint32 requestType) action,(uint8 tag,uint32 sourceDomain,bytes32 sourceRecipient) fbk,(uint8 tag,bytes32 pool,uint32 minApyBps,uint64 maxStellarLedgerTs)[] conditions) order",
    ]),
    [
      {
        inputToken: usdc,
        amount: BigInt(intent.amount),
        maxFee: BigInt(intent.maxFee),
        userStellarAddr: strkeyContractToBytes32(intent.userStellarAddr),
        nonce,
        action,
        fbk,
        conditions,
      },
    ],
  );
}

export function computeIntentHashPacked(
  chainId: number,
  originSettler: `0x${string}`,
  user: `0x${string}`,
  nonce: bigint,
  orderData: `0x${string}`,
): `0x${string}` {
  const chainIdHex = BigInt(chainId).toString(16).padStart(64, "0");
  const originHex = originSettler.slice(2).padStart(40, "0");
  const userHex = user.slice(2).padStart(40, "0");
  const nonceHex = nonce.toString(16).padStart(64, "0");
  const packed = ("0x" +
    chainIdHex +
    originHex +
    userHex +
    nonceHex +
    orderData.slice(2)) as `0x${string}`;
  return keccak256(packed);
}
