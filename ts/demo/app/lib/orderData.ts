/**
 * Order-data encoding — mirrors the Solidity NietOrderData ABI layout so the
 * frontend can produce inputs to OriginSettler.open() without a REST round trip.
 */

import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from "viem";
import { StrKey } from "@stellar/stellar-sdk";

import { NIET } from "@/app/config/niet";

export const ORDER_DATA_TYPE = keccak256(toHex("NietOrderDataV1")) as `0x${string}`;

export type ConditionInput =
  | { tag: "RateThreshold"; pool: string; minApyBps: number }
  | { tag: "TimeBound"; maxStellarLedgerTs: number };

export type FallbackInput =
  | {
      tag: "Refund";
      sourceDomain: number;
      sourceRecipient: `0x${string}`;
    }
  | { tag: "Hold" };

export interface NietOrderInput {
  amountMicroUsdc: string;
  maxFeeMicroUsdc: string;
  userStellarAddr: string; // C-strkey
  pool: string; // Blend pool C-strkey
  requestType: number;
  conditions: ConditionInput[];
  fallback: FallbackInput;
}

export function strkeyContractToBytes32(strkey: string): `0x${string}` {
  const raw = StrKey.decodeContract(strkey);
  return ("0x" + Buffer.from(raw).toString("hex")) as `0x${string}`;
}

export function encodeOrderData(input: NietOrderInput, nonce: bigint): `0x${string}` {
  const conditions = input.conditions.map((c) => {
    if (c.tag === "RateThreshold") {
      return {
        tag: 0,
        pool: strkeyContractToBytes32(c.pool),
        minApyBps: c.minApyBps,
        maxStellarLedgerTs: 0n,
      };
    }
    return {
      tag: 1,
      pool: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      minApyBps: 0,
      maxStellarLedgerTs: BigInt(c.maxStellarLedgerTs),
    };
  });

  const fbk =
    input.fallback.tag === "Refund"
      ? {
          tag: 0,
          sourceDomain: input.fallback.sourceDomain,
          sourceRecipient: input.fallback.sourceRecipient,
        }
      : {
          tag: 1,
          sourceDomain: 0,
          sourceRecipient:
            "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        };

  return encodeAbiParameters(
    parseAbiParameters([
      "(address inputToken,uint256 amount,uint256 maxFee,bytes32 userStellarAddr,uint256 nonce,(uint8 tag,bytes32 pool,uint32 requestType) action,(uint8 tag,uint32 sourceDomain,bytes32 sourceRecipient) fbk,(uint8 tag,bytes32 pool,uint32 minApyBps,uint64 maxStellarLedgerTs)[] conditions) order",
    ]),
    [
      {
        inputToken: NIET.USDC_BASE_SEPOLIA,
        amount: BigInt(input.amountMicroUsdc),
        maxFee: BigInt(input.maxFeeMicroUsdc),
        userStellarAddr: strkeyContractToBytes32(input.userStellarAddr),
        nonce,
        action: {
          tag: 0,
          pool: strkeyContractToBytes32(input.pool),
          requestType: input.requestType,
        },
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
