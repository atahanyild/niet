import { StrKey } from "@stellar/stellar-sdk";

/// Convert a Stellar C-contract strkey (56 chars) to an EVM-compatible bytes32 hex string.
export function strkeyContractToBytes32(strkey: string): `0x${string}` {
  const raw = StrKey.decodeContract(strkey);
  return `0x${Buffer.from(raw).toString("hex")}`;
}

/// Convert a bytes32 hex string to a Stellar C-contract strkey.
export function bytes32ToStrkeyContract(bytes32: string): string {
  const clean = bytes32.startsWith("0x") ? bytes32.slice(2) : bytes32;
  const raw = Buffer.from(clean, "hex");
  return StrKey.encodeContract(raw);
}

/// Convert an EVM address to bytes32 (left-padded with zeros).
export function addressToBytes32(addr: `0x${string}`): `0x${string}` {
  const clean = addr.slice(2).toLowerCase().padStart(64, "0");
  return `0x${clean}`;
}
