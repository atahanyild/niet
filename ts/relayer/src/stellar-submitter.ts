import {
  Contract as StellarContract,
  Keypair,
  TransactionBuilder,
  rpc as SorobanRpc,
  xdr,
} from "@stellar/stellar-sdk";
import { hexToBytes } from "viem";

import { log } from "./lib/logger.js";

export interface SubmitConfig {
  sorobanRpc: string;
  networkPassphrase: string;
  contractId: string;
  signerSecret: string;
}

/// Submit an attested CCTP message + attestation to the destination contract's
/// mint_and_settle (or mint_and_log for the Day-0 forwarder). Blocks until the
/// tx is confirmed.
export async function submitMintAndSettle(
  cfg: SubmitConfig,
  message: `0x${string}`,
  attestation: `0x${string}`,
  functionName: "mint_and_settle" | "mint_and_log" = "mint_and_settle",
): Promise<string> {
  const server = new SorobanRpc.Server(cfg.sorobanRpc, {
    allowHttp: cfg.sorobanRpc.startsWith("http://"),
  });
  const kp = Keypair.fromSecret(cfg.signerSecret);
  const source = await server.getAccount(kp.publicKey());
  const contract = new StellarContract(cfg.contractId);

  const op = contract.call(
    functionName,
    xdr.ScVal.scvBytes(Buffer.from(hexToBytes(message))),
    xdr.ScVal.scvBytes(Buffer.from(hexToBytes(attestation))),
  );

  let tx = new TransactionBuilder(source, {
    fee: "10000000",
    networkPassphrase: cfg.networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(300)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    log("error", "soroban simulation error", { error: sim.error });
    throw new Error(`Soroban simulation failed: ${sim.error}`);
  }
  tx = SorobanRpc.assembleTransaction(tx, sim).build();
  tx.sign(kp);

  const sendResult = await server.sendTransaction(tx);
  if (sendResult.status === "ERROR") {
    log("error", "soroban sendTransaction error", { result: sendResult });
    throw new Error(`Soroban submission errored`);
  }
  log("info", "soroban submitted", { hash: sendResult.hash });
  return sendResult.hash;
}
