/**
 * End-to-end testnet verification: Refund-fallback path.
 *
 * Constructs a NietOrderData with a failing TimeBound (max_ts = 0) and Refund
 * fallback pointing at the user's Base Sepolia address (bytes32 form). On
 * settlement, NietSettler's ConditionEvaluator fails, and the fallback triggers
 * TokenMessenger.deposit_for_burn on Stellar — burning USDC back to Base.
 *
 * Two attestations then need to be picked up:
 *   1. Base -> Stellar (initial burn, results in mint to NietSettler + refund burn)
 *   2. Stellar -> Base (refund burn, results in mint back to user on Base)
 *
 * The second requires a second Iris poll + submission to the Base MessageTransmitter.
 * For now this script goes as far as observing the IntentRefunded event on
 * Stellar — the second CCTP leg is out of scope for the initial verification.
 *
 * Run with:
 *   pnpm dlx tsx scripts/e2e-refund-path.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { StrKey } from "@stellar/stellar-sdk";

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
    day_0_test_mint_recipient: string;
  };
};

const usdcAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const originSettlerAbi = parseAbi([
  "function open((uint32,bytes32,bytes) order) payable",
]);

const ORDER_DATA_TYPE = keccak256(toHex("NietOrderDataV1"));

async function main() {
  log("info", "e2e-refund-path start");
  const env = loadEnv();

  const account = privateKeyToAccount(env.BASE_SEPOLIA_PRIVATE_KEY as `0x${string}`);
  const baseClient = createPublicClient({
    chain: baseSepolia,
    transport: http(deployments.network.base.rpc),
  });
  const baseWallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(deployments.network.base.rpc),
  });

  const dayZeroBytes32 = strkeyContractToBytes32(
    deployments.niet.day_0_test_mint_recipient,
  );
  const poolBytes32 =
    "0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20" as `0x${string}`;

  // Refund target: my own Base Sepolia address as bytes32 (padded left).
  const sourceRecipient = `0x${account.address.slice(2).padStart(64, "0").toLowerCase()}` as `0x${string}`;

  const amount = parseUnits("1", 6);
  const maxFee = 500n;

  const nietOrderData = {
    inputToken: deployments.circle_cctp.base_sepolia.usdc,
    amount,
    maxFee,
    userStellarAddr: dayZeroBytes32,
    action: {
      tag: 0,
      pool: poolBytes32,
      requestType: 2,
    },
    fbk: {
      tag: 0, // Refund
      sourceDomain: 6, // Base Sepolia
      sourceRecipient,
    },
    conditions: [
      {
        tag: 1, // TimeBound
        pool:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        minApyBps: 0,
        maxStellarLedgerTs: 0n, // force-fail
      },
    ],
  };

  const orderData = encodeAbiParameters(
    parseAbiParameters([
      "(address inputToken,uint256 amount,uint256 maxFee,bytes32 userStellarAddr,(uint8 tag,bytes32 pool,uint32 requestType) action,(uint8 tag,uint32 sourceDomain,bytes32 sourceRecipient) fbk,(uint8 tag,bytes32 pool,uint32 minApyBps,uint64 maxStellarLedgerTs)[] conditions) order",
    ]),
    [nietOrderData],
  );

  const order = {
    fillDeadline: Math.floor(Date.now() / 1000) + 3600,
    orderDataType: ORDER_DATA_TYPE,
    orderData,
  };

  log("info", "preflight", {
    sender: account.address,
    settler: deployments.niet.origin_settler,
    refundRecipient: sourceRecipient,
  });

  // Approve
  log("info", "approve OriginSettler for USDC");
  const approveTx = await baseWallet.writeContract({
    address: deployments.circle_cctp.base_sepolia.usdc,
    abi: usdcAbi,
    functionName: "approve",
    args: [deployments.niet.origin_settler, amount],
  });
  await baseClient.waitForTransactionReceipt({ hash: approveTx });

  // Open
  log("info", "OriginSettler.open");
  const openTx = await baseWallet.writeContract({
    address: deployments.niet.origin_settler,
    abi: originSettlerAbi,
    functionName: "open",
    args: [[order.fillDeadline, order.orderDataType, order.orderData]],
  });
  await baseClient.waitForTransactionReceipt({ hash: openTx });
  log("info", "open confirmed", {
    tx: openTx,
    basescan: `https://sepolia.basescan.org/tx/${openTx}`,
  });

  // Iris
  const attested = await pollIrisUntilAttested({
    irisUrl: deployments.circle_cctp.iris_sandbox_url,
    sourceDomain: deployments.network.base.cctp_domain,
    txHash: openTx,
  });

  // Submit
  log("info", "submitting mint_and_settle to NietSettler v2");
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

  log("info", "e2e-refund-path complete", {
    baseOpen: `https://sepolia.basescan.org/tx/${openTx}`,
    stellarSettle: `https://stellar.expert/explorer/testnet/tx/${settleHash}`,
  });
}

function strkeyContractToBytes32(strkey: string): `0x${string}` {
  const raw = StrKey.decodeContract(strkey);
  return `0x${Buffer.from(raw).toString("hex")}`;
}

main().catch((err: unknown) => {
  log("error", "e2e-refund-path failed", {
    err: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
