import type { NextRequest } from "next/server";

import { pollIrisUntilAttested, submitMintAndSettle } from "@/app/lib/api/relayer";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RelayRequest {
  burnTxHash: `0x${string}`;
}

const IRIS_URL = "https://iris-api-sandbox.circle.com";
const BASE_SEPOLIA_DOMAIN = 6;
const STELLAR_RPC =
  process.env.STELLAR_TESTNET_RPC ?? "https://soroban-testnet.stellar.org";
const STELLAR_PASSPHRASE = "Test SDF Network ; September 2015";
const NIET_SETTLER_ID =
  process.env.NIET_SETTLER_ID ??
  "CC3F2ZF7SM6GT7EYWPXULBJWDHNHMYEL3VFJ3A5HRORJ7PHFKNBOWULE";

export async function POST(req: NextRequest) {
  const signerSecret = process.env.STELLAR_RELAYER_SECRET;
  if (!signerSecret) {
    return Response.json(
      { error: { code: "config", message: "Relayer secret not configured" } },
      { status: 500 },
    );
  }

  let body: RelayRequest;
  try {
    body = (await req.json()) as RelayRequest;
  } catch {
    return Response.json(
      { error: { code: "invalid_json", message: "Body must be JSON" } },
      { status: 400 },
    );
  }

  if (!body.burnTxHash?.startsWith("0x") || body.burnTxHash.length !== 66) {
    return Response.json(
      { error: { code: "invalid_hash", message: "burnTxHash must be a 0x-prefixed 32-byte hash" } },
      { status: 400 },
    );
  }

  console.log("[relay] start", { burnTxHash: body.burnTxHash });
  try {
    const attested = await pollIrisUntilAttested({
      irisUrl: IRIS_URL,
      sourceDomain: BASE_SEPOLIA_DOMAIN,
      txHash: body.burnTxHash,
    });
    console.log("[relay] attested", {
      messageLen: (attested.message.length - 2) / 2,
    });

    const stellarTxHash = await submitMintAndSettle(
      {
        sorobanRpc: STELLAR_RPC,
        networkPassphrase: STELLAR_PASSPHRASE,
        contractId: NIET_SETTLER_ID,
        signerSecret,
      },
      attested.message,
      attested.attestation,
    );
    console.log("[relay] settled", { stellarTxHash });

    return Response.json({
      ok: true,
      stellarTxHash,
      stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${stellarTxHash}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[relay] failed", { burnTxHash: body.burnTxHash, message });
    return Response.json(
      { error: { code: "relay_failed", message } },
      { status: 500 },
    );
  }
}
