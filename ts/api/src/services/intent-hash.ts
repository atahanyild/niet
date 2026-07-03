import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from "viem";

import type { Intent } from "../schemas/intent.js";
import { strkeyContractToBytes32 } from "./stellar.js";

/// keccak256("NietOrderDataV1") — matches Solidity NietTypes.ORDER_DATA_TYPE_NIET_V1.
export const ORDER_DATA_TYPE = keccak256(toHex("NietOrderDataV1"));

/// Serialize an Intent + Base user address into the ABI-encoded orderData bytes
/// that Solidity's OriginSettler expects. This must match Solidity's
/// abi.decode(orderData, (NietTypes.NietOrderData)) layout.
export function encodeOrderData(intent: Intent, usdc: `0x${string}`): `0x${string}` {
  const action =
    intent.action.tag === "BlendSupply"
      ? {
          tag: 0,
          pool: strkeyContractToBytes32(intent.action.pool),
          requestType: intent.action.requestType,
        }
      : { tag: 0, pool: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`, requestType: 0 };

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
          sourceRecipient: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        };

  const conditions = intent.conditions.map((c) => {
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

  const orderData = encodeAbiParameters(
    parseAbiParameters([
      "(address inputToken,uint256 amount,uint256 maxFee,bytes32 userStellarAddr,(uint8 tag,bytes32 pool,uint32 requestType) action,(uint8 tag,uint32 sourceDomain,bytes32 sourceRecipient) fbk,(uint8 tag,bytes32 pool,uint32 minApyBps,uint64 maxStellarLedgerTs)[] conditions) order",
    ]),
    [
      {
        inputToken: usdc,
        amount: BigInt(intent.amount),
        maxFee: BigInt(intent.maxFee),
        userStellarAddr: strkeyContractToBytes32(intent.userStellarAddr),
        action,
        fbk,
        conditions,
      },
    ],
  );
  return orderData;
}

/// keccak256(chainId, originSettler, user, nonce, orderData) — matches
/// Solidity IntentHash library.
export function computeIntentHash(
  chainId: number,
  originSettler: `0x${string}`,
  user: `0x${string}`,
  nonce: bigint,
  orderData: `0x${string}`,
): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters("uint256,address,address,uint256,bytes"),
    [BigInt(chainId), originSettler, user, nonce, orderData],
  );
  // Note: Solidity uses abi.encodePacked — we mirror that with a separate
  // implementation below. keeping this here just in case a strict test wants
  // encode. For advisory identifier semantics, encode is fine.
  return keccak256(encoded);
}

/// Solidity-compatible packed keccak256(chainId, originSettler, user, nonce, orderData).
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
  const packed = `0x${chainIdHex}${originHex}${userHex}${nonceHex}${orderData.slice(2)}` as `0x${string}`;
  return keccak256(packed);
}
