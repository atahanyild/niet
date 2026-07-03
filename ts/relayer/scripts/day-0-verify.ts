/**
 * Day-0 CCTP V2 Fast Attestation verification spike.
 *
 * Sequence:
 *   1. Approve 1 USDC to Base Sepolia TokenMessengerV2
 *   2. Call depositForBurnWithHook with mintRecipient + destinationCaller = day-0 test
 *      C-contract, arbitrary hookData bytes, minFinalityThreshold = 1000 (Fast Transfer).
 *      Record t_burned.
 *   3. Poll Iris sandbox until attestation is ready. Record t_attested.
 *   4. Submit attested message to day-0-test-forwarder.mint_and_log on Stellar testnet.
 *      Record t_minted.
 *   5. Print latency deltas.
 *
 * Blocking check for Niet's primary architecture: if Iris returns attestation within
 * ~3 minutes, Fast Attestation works for custom mint_recipient contracts, and the
 * primary architecture proceeds. Otherwise the contingency plan (stock CctpForwarder
 * + Niet keeper) activates.
 *
 * Run with:
 *   pnpm dlx tsx scripts/day-0-verify.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  hexToBytes,
  http,
  parseAbi,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  Contract as StellarContract,
  Keypair,
  StrKey,
  TransactionBuilder,
  rpc as SorobanRpc,
  xdr,
} from "@stellar/stellar-sdk";

// ---------- configuration ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../..");

const deployments = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "deployments/testnet.json"), "utf8"),
) as {
  network: {
    stellar: { soroban_rpc: string; passphrase: string; cctp_domain: number };
    base: { rpc: string; chain_id: number; cctp_domain: number };
  };
  circle_cctp: {
    stellar_testnet: { message_transmitter_v2: string; token_messenger_minter_v2: string };
    base_sepolia: { token_messenger_v2: `0x${string}`; usdc: `0x${string}` };
    iris_sandbox_url: string;
    finality_threshold: { fast_transfer: number; standard_transfer: number };
  };
  niet: { day_0_test_mint_recipient: string };
};

const env = readEnv();

// ---------- ABIs ----------

const usdcAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// CCTP V2 TokenMessenger depositForBurnWithHook signature per Circle docs.
const tokenMessengerV2Abi = parseAbi([
  "event MessageSent(bytes message)",
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
  "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)",
]);

// ---------- main ----------

async function main() {
  console.log("# Day-0 CCTP V2 Fast Attestation Verification\n");

  const amount = parseUnits("1", 6); // 1 USDC
  const hookData = "0xdeadbeefcafebabe0011223344556677" as `0x${string}`; // arbitrary
  const maxFee = 500n; // 500 units = 0.0005 USDC max fee (Circle bps-scaled)
  const fastFinality = deployments.circle_cctp.finality_threshold.fast_transfer;

  const mintRecipient = strkeyContractToBytes32(deployments.niet.day_0_test_mint_recipient);
  const destinationCaller = mintRecipient; // same contract

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

  console.log("Config:");
  console.log(`  Base Sepolia sender: ${account.address}`);
  console.log(`  USDC token:          ${deployments.circle_cctp.base_sepolia.usdc}`);
  console.log(`  TokenMessengerV2:    ${deployments.circle_cctp.base_sepolia.token_messenger_v2}`);
  console.log(`  destinationDomain:   ${deployments.network.stellar.cctp_domain}`);
  console.log(`  mintRecipient:       ${deployments.niet.day_0_test_mint_recipient}`);
  console.log(`  mintRecipient (b32): ${mintRecipient}`);
  console.log(`  hookData:            ${hookData}`);
  console.log(`  minFinalityThreshold:${fastFinality}`);
  console.log(`  amount:              ${amount} (${1} USDC)\n`);

  // Preflight: check ETH + USDC balances
  const ethBalance = await baseClient.getBalance({ address: account.address });
  const usdcBalance = await baseClient.readContract({
    address: deployments.circle_cctp.base_sepolia.usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`Preflight balances:`);
  console.log(`  Base Sepolia ETH:  ${ethBalance} wei`);
  console.log(`  Base Sepolia USDC: ${usdcBalance} (min needed: ${amount})\n`);

  if (ethBalance === 0n) {
    throw new Error(
      `FUNDING NEEDED: Base Sepolia ETH is 0. Send some to ${account.address} from a faucet.`,
    );
  }
  if (usdcBalance < amount) {
    throw new Error(
      `FUNDING NEEDED: Base Sepolia USDC balance is ${usdcBalance}, need at least ${amount}. Get from faucet.circle.com.`,
    );
  }

  // Step 1: Approve
  console.log("Step 1: approve USDC to TokenMessengerV2");
  const currentAllowance = await baseClient.readContract({
    address: deployments.circle_cctp.base_sepolia.usdc,
    abi: usdcAbi,
    functionName: "allowance",
    args: [account.address, deployments.circle_cctp.base_sepolia.token_messenger_v2],
  });
  if (currentAllowance < amount) {
    const approveHash = await baseWallet.writeContract({
      address: deployments.circle_cctp.base_sepolia.usdc,
      abi: usdcAbi,
      functionName: "approve",
      args: [deployments.circle_cctp.base_sepolia.token_messenger_v2, amount],
    });
    console.log(`  approve tx: ${approveHash}`);
    await baseClient.waitForTransactionReceipt({ hash: approveHash });
  } else {
    console.log(`  allowance already sufficient (${currentAllowance})`);
  }

  // Step 2: Burn
  console.log("\nStep 2: depositForBurnWithHook");
  const t_burned_start = Date.now();
  const burnHash = await baseWallet.writeContract({
    address: deployments.circle_cctp.base_sepolia.token_messenger_v2,
    abi: tokenMessengerV2Abi,
    functionName: "depositForBurnWithHook",
    args: [
      amount,
      deployments.network.stellar.cctp_domain,
      mintRecipient,
      deployments.circle_cctp.base_sepolia.usdc,
      destinationCaller,
      maxFee,
      fastFinality,
      hookData,
    ],
  });
  console.log(`  burn tx: ${burnHash}`);
  console.log(`  Basescan: https://sepolia.basescan.org/tx/${burnHash}`);

  const burnReceipt = await baseClient.waitForTransactionReceipt({ hash: burnHash });
  const t_burned = Date.now();
  console.log(`  burn confirmed in block ${burnReceipt.blockNumber} (t+${t_burned - t_burned_start}ms)`);

  // Step 3: Poll Iris
  console.log("\nStep 3: poll Iris sandbox for attestation");
  const irisUrl =
    `${deployments.circle_cctp.iris_sandbox_url}/v2/messages/${deployments.network.base.cctp_domain}?transactionHash=${burnHash}`;
  console.log(`  URL: ${irisUrl}`);

  const t_poll_start = Date.now();
  let attestation: string | undefined;
  let message: string | undefined;
  const pollInterval = 5_000;
  const maxWait = 30 * 60 * 1000; // 30 min ceiling
  while (Date.now() - t_poll_start < maxWait) {
    const res = await fetch(irisUrl);
    const body: unknown = await res.json();
    if (!isIrisResponse(body)) {
      console.log(`  unexpected response shape, retrying in ${pollInterval / 1000}s...`);
    } else if (body.messages && body.messages.length > 0) {
      const m = body.messages[0];
      if (m && m.status === "complete" && m.attestation && m.message) {
        attestation = m.attestation;
        message = m.message;
        break;
      }
      console.log(`  status: ${m?.status ?? "unknown"} (t+${((Date.now() - t_poll_start) / 1000).toFixed(1)}s)`);
    } else {
      console.log(`  no messages yet (t+${((Date.now() - t_poll_start) / 1000).toFixed(1)}s)`);
    }
    await sleep(pollInterval);
  }

  if (!attestation || !message) {
    throw new Error("Iris did not return an attestation within 30 minutes.");
  }

  const t_attested = Date.now();
  console.log(`  attestation ready (t+${((t_attested - t_burned) / 1000).toFixed(1)}s from burn)`);
  console.log(`  message length: ${(message.length - 2) / 2} bytes`);
  console.log(`  attestation length: ${(attestation.length - 2) / 2} bytes`);

  // Step 4: Submit on Stellar
  console.log("\nStep 4: submit mint_and_log on Stellar testnet");
  const server = new SorobanRpc.Server(deployments.network.stellar.soroban_rpc, {
    allowHttp: deployments.network.stellar.soroban_rpc.startsWith("http://"),
  });
  const stellarKp = Keypair.fromSecret(env.STELLAR_TESTNET_SECRET);
  const source = await server.getAccount(stellarKp.publicKey());
  const contract = new StellarContract(deployments.niet.day_0_test_mint_recipient);

  const messageBytes = hexToBytes(message as `0x${string}`);
  const attestationBytes = hexToBytes(attestation as `0x${string}`);

  const op = contract.call(
    "mint_and_log",
    xdr.ScVal.scvBytes(Buffer.from(messageBytes)),
    xdr.ScVal.scvBytes(Buffer.from(attestationBytes)),
  );

  let tx = new TransactionBuilder(source, {
    fee: "10000000",
    networkPassphrase: deployments.network.stellar.passphrase,
  })
    .addOperation(op)
    .setTimeout(300)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    console.error(`  simulation error: ${simResult.error}`);
    throw new Error("Soroban simulation failed");
  }
  tx = SorobanRpc.assembleTransaction(tx, simResult).build();
  tx.sign(stellarKp);

  const submitStart = Date.now();
  const sendResult = await server.sendTransaction(tx);
  if (sendResult.status === "ERROR") {
    console.error(`  sendTransaction ERROR: ${JSON.stringify(sendResult, null, 2)}`);
    throw new Error("Soroban submission errored");
  }
  const hash = sendResult.hash;
  console.log(`  submitted: ${hash}`);
  console.log(`  Stellar Expert: https://stellar.expert/explorer/testnet/tx/${hash}`);

  // Poll for confirmation
  let getResp = await server.getTransaction(hash);
  while (getResp.status === "NOT_FOUND") {
    await sleep(2000);
    getResp = await server.getTransaction(hash);
  }
  const t_minted = Date.now();

  if (getResp.status !== "SUCCESS") {
    console.error(`  soroban tx FAILED: status=${getResp.status}`);
    console.error(JSON.stringify(getResp, null, 2));
    throw new Error(`Soroban tx did not succeed: ${getResp.status}`);
  }

  console.log(`  mint_and_log confirmed (t+${((t_minted - submitStart) / 1000).toFixed(1)}s from submit)`);

  // ---------- summary ----------

  const summary = {
    timestamps: {
      t_burned_ms: t_burned,
      t_attested_ms: t_attested,
      t_minted_ms: t_minted,
    },
    latencies_s: {
      burn_to_attested: ((t_attested - t_burned) / 1000).toFixed(1),
      attested_to_minted: ((t_minted - t_attested) / 1000).toFixed(1),
      burn_to_minted_total: ((t_minted - t_burned) / 1000).toFixed(1),
    },
    txs: {
      base_burn: `https://sepolia.basescan.org/tx/${burnHash}`,
      stellar_mint: `https://stellar.expert/explorer/testnet/tx/${hash}`,
    },
    verdict: (t_attested - t_burned) < 180_000
      ? "FAST — primary architecture GREEN LIGHT (custom mint_recipient attested at Fast tier)"
      : "SLOW — Iris took >3min. Consider contingency (stock CctpForwarder + keeper).",
  };
  console.log("\n---");
  console.log(JSON.stringify(summary, null, 2));
  console.log("---");
}

// ---------- helpers ----------

function readEnv(): { BASE_SEPOLIA_PRIVATE_KEY: string; STELLAR_TESTNET_SECRET: string } {
  const envPath = resolve(REPO_ROOT, ".env.local");
  const text = readFileSync(envPath, "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m && m[1] && m[2]) out[m[1]] = m[2];
  }
  const missing = ["BASE_SEPOLIA_PRIVATE_KEY", "STELLAR_TESTNET_SECRET"].filter((k) => !out[k]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars in .env.local: ${missing.join(", ")}`);
  }
  return {
    BASE_SEPOLIA_PRIVATE_KEY: out.BASE_SEPOLIA_PRIVATE_KEY!,
    STELLAR_TESTNET_SECRET: out.STELLAR_TESTNET_SECRET!,
  };
}

function strkeyContractToBytes32(strkey: string): `0x${string}` {
  const raw = StrKey.decodeContract(strkey); // 32-byte contract ID
  return `0x${Buffer.from(raw).toString("hex")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface IrisMessage {
  status: string;
  attestation?: string;
  message?: string;
}

interface IrisResponse {
  messages?: IrisMessage[];
}

function isIrisResponse(x: unknown): x is IrisResponse {
  return typeof x === "object" && x !== null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
