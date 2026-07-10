/**
 * Relay one existing Base burn tx to Stellar. Given a burn tx hash on Base
 * Sepolia, polls Iris until attestation is complete and submits
 * NietSettler.mint_and_settle. Use this to manually kick a stuck intent out
 * of the "attested but not minted" state (until we ship the automated
 * relayer daemon).
 *
 * Run with:
 *   pnpm dlx tsx scripts/relay-one.ts <base-burn-tx-hash>
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { loadEnv } from "../src/env.js";
import { pollIrisUntilAttested } from "../src/iris-poller.js";
import { submitMintAndSettle } from "../src/stellar-submitter.js";
import { log } from "../src/lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../..");

const deployments = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "deployments/testnet.json"), "utf8"),
) as {
  network: {
    stellar: { soroban_rpc: string; passphrase: string; cctp_domain: number };
    base: { rpc: string; cctp_domain: number };
  };
  circle_cctp: {
    base_sepolia: { usdc: `0x${string}` };
    iris_sandbox_url: string;
  };
  niet: {
    niet_settler: string;
    origin_settler: `0x${string}`;
  };
};

async function main() {
  const burnTx = process.argv[2];
  if (!burnTx || !burnTx.startsWith("0x") || burnTx.length !== 66) {
    console.error("Usage: pnpm dlx tsx scripts/relay-one.ts <base-burn-tx-hash>");
    process.exit(2);
  }

  log("info", "relay-one start", { burnTx });
  const env = loadEnv();

  log("info", "polling Iris for attestation");
  const attested = await pollIrisUntilAttested({
    irisUrl: deployments.circle_cctp.iris_sandbox_url,
    sourceDomain: deployments.network.base.cctp_domain,
    txHash: burnTx as `0x${string}`,
  });
  log("info", "iris attested", {
    messageLen: (attested.message.length - 2) / 2,
    attestationLen: (attested.attestation.length - 2) / 2,
  });

  log("info", "submitting mint_and_settle to NietSettler");
  const settleHash = await submitMintAndSettle(
    {
      sorobanRpc: env.STELLAR_TESTNET_RPC,
      networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
      contractId: deployments.niet.niet_settler,
      signerSecret: env.STELLAR_TESTNET_SECRET,
    },
    attested.message,
    attested.attestation,
    "mint_and_settle",
  );

  log("info", "relay-one complete", {
    baseOpen: `https://sepolia.basescan.org/tx/${burnTx}`,
    stellarSettle: `https://stellar.expert/explorer/testnet/tx/${settleHash}`,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
