/**
 * Niet relayer entry point.
 *
 * Two modes:
 *  1. Continuous — poll Base for new OriginSettler Open events, poll Iris for
 *     each, submit to NietSettler. Restart-safe (re-scans from a checkpoint).
 *  2. One-shot   — given a burn tx hash, poll Iris and submit. Used by the
 *     Day-0 spike and CI-style end-to-end tests.
 *
 * For v1 we default to one-shot mode invoked with:
 *   pnpm dlx tsx src/index.ts --burn-tx 0x...
 *
 * Continuous mode is TBD in Story 1.10.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnv, REPO_ROOT } from "./env.js";
import { log } from "./lib/logger.js";
import { pollIrisUntilAttested } from "./iris-poller.js";
import { submitMintAndSettle } from "./stellar-submitter.js";

interface Deployments {
  network: {
    stellar: { soroban_rpc: string; passphrase: string; cctp_domain: number };
    base: { cctp_domain: number; rpc: string };
  };
  circle_cctp: { iris_sandbox_url: string };
  niet: { niet_settler: string };
}

function loadDeployments(): Deployments {
  return JSON.parse(
    readFileSync(resolve(REPO_ROOT, "deployments/testnet.json"), "utf8"),
  ) as Deployments;
}

function parseArgs(argv: string[]): { burnTx?: string } {
  const out: { burnTx?: string } = {};
  for (let i = 0; i < argv.length; ++i) {
    const a = argv[i];
    if (a === "--burn-tx" && argv[i + 1]) {
      out.burnTx = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

export const RELAYER_VERSION = "0.1.0";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const dep = loadDeployments();

  if (!args.burnTx) {
    log("info", `Niet relayer v${RELAYER_VERSION}. One-shot mode.`);
    log("info", "Usage: tsx src/index.ts --burn-tx 0x...");
    process.exit(1);
  }

  const burnTx = args.burnTx!;
  log("info", "relayer one-shot start", { burnTx });

  const attested = await pollIrisUntilAttested({
    irisUrl: env.IRIS_SANDBOX_URL,
    sourceDomain: dep.network.base.cctp_domain,
    txHash: burnTx,
  });
  log("info", "iris attested", {
    messageLen: (attested.message.length - 2) / 2,
    attestationLen: (attested.attestation.length - 2) / 2,
  });

  const stellarTx = await submitMintAndSettle(
    {
      sorobanRpc: env.STELLAR_TESTNET_RPC,
      networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
      contractId: dep.niet.niet_settler,
      signerSecret: env.STELLAR_TESTNET_SECRET,
    },
    attested.message,
    attested.attestation,
    "mint_and_settle",
  );
  log("info", "stellar mint_and_settle submitted", {
    hash: stellarTx,
    stellarExpert: `https://stellar.expert/explorer/testnet/tx/${stellarTx}`,
  });
}

// Skip main execution when imported as a module (for tests).
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err: unknown) => {
    log("error", "relayer failed", { err: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
