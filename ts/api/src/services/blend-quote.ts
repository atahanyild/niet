import type { Intent } from "../schemas/intent.js";

export interface ConditionPreview {
  tag: string;
  satisfiable: boolean;
  current?: string;
  note?: string;
}

/// Preview whether each condition would pass at current on-chain state.
///
/// v1 is best-effort: rate_threshold reads are skipped for the pool address
/// unless we can talk to Blend's SDK from a Cloudflare Worker (Blend SDK uses
/// Node APIs that aren't available in Workers). We surface "unknown" for
/// rate_threshold in the Worker path; local dev / server-side users can wire
/// the real read.
export async function previewConditions(
  intent: Intent,
  _stellarRpc: string,
): Promise<ConditionPreview[]> {
  const now = Math.floor(Date.now() / 1000);
  return intent.conditions.map((c) => {
    if (c.tag === "TimeBound") {
      const satisfiable = now <= c.maxStellarLedgerTs;
      return {
        tag: "TimeBound",
        satisfiable,
        current: String(now),
        note: satisfiable
          ? `Current unix time ${now} <= max ${c.maxStellarLedgerTs}`
          : `Current unix time ${now} exceeds max ${c.maxStellarLedgerTs}`,
      };
    }
    if (c.tag === "RateThreshold") {
      return {
        tag: "RateThreshold",
        satisfiable: true,
        note: "Pool APY read not wired in v1 REST. Relayer will evaluate at settlement.",
      };
    }
    return { tag: "unknown", satisfiable: false, note: "Unknown condition variant." };
  });
}
