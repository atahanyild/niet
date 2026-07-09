import { StrKey, xdr } from "@stellar/stellar-sdk";

const SETTLED_TAG_BASE64 = encodeSymbolTopic("settled");
const REFUNDED_TAG_BASE64 = encodeSymbolTopic("refunded");
const HELD_TAG_BASE64 = encodeSymbolTopic("held");

interface SorobanEvent {
  topic?: string[];
  txHash?: string;
  transactionHash?: string;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message: string };
}

export async function findSettlementEvent(
  sorobanRpc: string,
  nietSettlerId: string,
  intentHashHex: `0x${string}`,
): Promise<
  | { state: "settled" | "refunded" | "held"; txHash: string }
  | null
> {
  const intentHashB64 = encodeBytesTopic(intentHashHex);
  const startLedger = await getRecentStartLedger(sorobanRpc, 120_000);

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getEvents",
    params: {
      startLedger,
      filters: [
        {
          type: "contract",
          contractIds: [nietSettlerId],
          topics: [["*", intentHashB64]],
        },
      ],
      pagination: { limit: 100 },
    },
  };

  const res = await fetch(sorobanRpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as JsonRpcResponse<{ events?: SorobanEvent[] }>;
  if (parsed.error) return null;

  for (const ev of parsed.result?.events ?? []) {
    const topic0 = ev.topic?.[0];
    if (!topic0) continue;
    const txHash = ev.txHash ?? ev.transactionHash ?? "";
    if (topic0 === SETTLED_TAG_BASE64) return { state: "settled", txHash };
    if (topic0 === REFUNDED_TAG_BASE64) return { state: "refunded", txHash };
    if (topic0 === HELD_TAG_BASE64) return { state: "held", txHash };
  }
  return null;
}

async function getRecentStartLedger(sorobanRpc: string, lookback: number): Promise<number> {
  const res = await fetch(sorobanRpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger", params: {} }),
  });
  const parsed = (await res.json()) as JsonRpcResponse<{ sequence: number }>;
  const latest = parsed.result?.sequence ?? 0;
  return Math.max(1, latest - lookback);
}

function encodeSymbolTopic(name: string): string {
  return xdr.ScVal.scvSymbol(name).toXDR("base64");
}

function encodeBytesTopic(hex: `0x${string}`): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const buf = Buffer.from(clean, "hex");
  return xdr.ScVal.scvBytes(buf).toXDR("base64");
}

export function strkeyContractToBytes32(strkey: string): `0x${string}` {
  const raw = StrKey.decodeContract(strkey);
  return `0x${Buffer.from(raw).toString("hex")}` as `0x${string}`;
}
