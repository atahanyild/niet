import { log } from "./lib/logger.js";

export interface AttestedMessage {
  message: `0x${string}`;
  attestation: `0x${string}`;
}

/// Poll Circle's Iris sandbox for an attested message tied to a source-chain
/// burn tx. Returns once Iris marks the message `complete`.
export async function pollIrisUntilAttested(opts: {
  irisUrl: string;
  sourceDomain: number;
  txHash: string;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<AttestedMessage> {
  const interval = opts.intervalMs ?? 5_000;
  const timeout = opts.timeoutMs ?? 30 * 60 * 1000;
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
    log(
      "info",
      `iris ${m?.status ?? "no-msg"}`,
      { elapsedSec: ((Date.now() - start) / 1000).toFixed(1) },
    );
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Iris attestation not ready within ${timeout / 1000}s`);
}
