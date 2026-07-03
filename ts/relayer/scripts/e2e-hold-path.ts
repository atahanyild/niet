/**
 * End-to-end testnet verification: Hold-fallback path.
 *
 * Constructs a NietOrderData with a failing TimeBound condition (max_ts = 0)
 * and Hold fallback, calls OriginSettler.open on Base Sepolia, polls Iris,
 * submits to NietSettler on Stellar testnet, then verifies USDC arrived at
 * the intent's user_stellar_addr (we use the day-0-test-forwarder as a
 * convenient valid C-address receiver).
 *
 * Run with:
 *   pnpm dlx tsx scripts/e2e-hold-path.ts
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

// ---------- ABIs ----------

const usdcAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const originSettlerAbi = parseAbi([
  "function open((uint32,bytes32,bytes) order) payable",
]);

// Solidity ORDER_DATA_TYPE_NIET_V1 = keccak256("NietOrderDataV1")
const ORDER_DATA_TYPE = keccak256(toHex("NietOrderDataV1"));

// ---------- main ----------

async function main() {
  log("info", "e2e-hold-path start");
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

  // Compose the intent. Hold fallback delivers to day-0-test-forwarder
  // (a valid C-contract address on Stellar testnet).
  const dayZeroBytes32 = strkeyContractToBytes32(
    deployments.niet.day_0_test_mint_recipient,
  );
  const poolBytes32 =
    "0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20" as `0x${string}`; // unused

  const amount = parseUnits("1", 6); // 1 USDC
  const maxFee = 500n;

  const nietOrderData = {
    inputToken: deployments.circle_cctp.base_sepolia.usdc,
    amount,
    maxFee,
    userStellarAddr: dayZeroBytes32,
    action: {
      tag: 0, // BlendSupply
      pool: poolBytes32,
      requestType: 2,
    },
    fbk: {
      tag: 1, // Hold
      sourceDomain: 0,
      sourceRecipient:
        "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    },
    conditions: [
      {
        tag: 1, // TimeBound
        pool: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        minApyBps: 0,
        maxStellarLedgerTs: 0n, // forces fail
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

  // Preflight: check balances
  const balUsdc = await baseClient.readContract({
    address: deployments.circle_cctp.base_sepolia.usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  log("info", "preflight", {
    sender: account.address,
    usdcBalance: balUsdc.toString(),
    settler: deployments.niet.origin_settler,
  });
  if (balUsdc < amount) {
    throw new Error(
      `insufficient USDC (${balUsdc} < ${amount}). Refuel via faucet.circle.com`,
    );
  }

  // Approve OriginSettler for the burn amount
  log("info", "approve OriginSettler for USDC");
  const approveTx = await baseWallet.writeContract({
    address: deployments.circle_cctp.base_sepolia.usdc,
    abi: usdcAbi,
    functionName: "approve",
    args: [deployments.niet.origin_settler, amount],
  });
  await baseClient.waitForTransactionReceipt({ hash: approveTx });

  // Call OriginSettler.open
  log("info", "OriginSettler.open", { orderDataType: order.orderDataType });
  const openTx = await baseWallet.writeContract({
    address: deployments.niet.origin_settler,
    abi: originSettlerAbi,
    functionName: "open",
    args: [[order.fillDeadline, order.orderDataType, order.orderData]],
  });
  const openReceipt = await baseClient.waitForTransactionReceipt({ hash: openTx });
  log("info", "open confirmed", {
    tx: openTx,
    block: openReceipt.blockNumber.toString(),
    basescan: `https://sepolia.basescan.org/tx/${openTx}`,
  });

  // Poll Iris
  log("info", "polling Iris for attestation");
  const attested = await pollIrisUntilAttested({
    irisUrl: deployments.circle_cctp.iris_sandbox_url,
    sourceDomain: deployments.network.base.cctp_domain,
    txHash: openTx,
  });
  log("info", "iris attested", {
    messageLen: (attested.message.length - 2) / 2,
    attestationLen: (attested.attestation.length - 2) / 2,
  });

  // Submit to NietSettler
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

  log("info", "e2e-hold-path complete", {
    baseOpen: `https://sepolia.basescan.org/tx/${openTx}`,
    stellarSettle: `https://stellar.expert/explorer/testnet/tx/${settleHash}`,
    verifyBalance: `stellar contract invoke --network testnet --source niet-testnet --id ${deployments.niet.day_0_test_mint_recipient} --send=no -- balance`,
  });
}

// ---------- helpers ----------

function strkeyContractToBytes32(strkey: string): `0x${string}` {
  const raw = StrKey.decodeContract(strkey);
  return `0x${Buffer.from(raw).toString("hex")}`;
}

main().catch((err: unknown) => {
  log("error", "e2e-hold-path failed", {
    err: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
