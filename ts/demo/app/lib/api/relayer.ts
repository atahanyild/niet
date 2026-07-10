import {
  Contract as StellarContract,
  Keypair,
  TransactionBuilder,
  rpc as SorobanRpc,
  xdr,
} from "@stellar/stellar-sdk";
import { hexToBytes } from "viem";

export interface AttestedMessage {
  message: `0x${string}`;
  attestation: `0x${string}`;
}

export async function pollIrisUntilAttested(opts: {
  irisUrl: string;
  sourceDomain: number;
  txHash: string;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<AttestedMessage> {
  const interval = opts.intervalMs ?? 3_000;
  const timeout = opts.timeoutMs ?? 55_000;
  const url = `${opts.irisUrl}/v2/messages/${opts.sourceDomain}?transactionHash=${opts.txHash}`;

  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(url);
    const body = (await res.json()) as {
      messages?: Array<{ status?: string; message?: string; attestation?: string }>;
    };
    const m = body.messages?.[0];
    if (m?.status === "complete" && m.message && m.attestation) {
      return {
        message: m.message as `0x${string}`,
        attestation: m.attestation as `0x${string}`,
      };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Iris attestation not ready within ${timeout / 1000}s`);
}

export async function submitMintAndSettle(cfg: {
  sorobanRpc: string;
  networkPassphrase: string;
  contractId: string;
  signerSecret: string;
}, message: `0x${string}`, attestation: `0x${string}`): Promise<string> {
  const server = new SorobanRpc.Server(cfg.sorobanRpc, {
    allowHttp: cfg.sorobanRpc.startsWith("http://"),
  });
  const kp = Keypair.fromSecret(cfg.signerSecret);
  const source = await server.getAccount(kp.publicKey());
  const contract = new StellarContract(cfg.contractId);

  const op = contract.call(
    "mint_and_settle",
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
    throw new Error(`Soroban simulation failed: ${sim.error}`);
  }
  tx = SorobanRpc.assembleTransaction(tx, sim).build();
  tx.sign(kp);

  const sendResult = await server.sendTransaction(tx);
  if (sendResult.status === "ERROR") {
    throw new Error(`Soroban submission errored: ${JSON.stringify(sendResult)}`);
  }
  return sendResult.hash;
}
