import { NIET } from "@/app/config/niet";

export interface StatusResponse {
  intentHash: string;
  state: "pending" | "settled" | "refunded" | "held";
  stellarTxHash?: string;
  stellarExpertUrl?: string;
  detail?: string;
}

/// Poll the REST API for an intent's current lifecycle state. Falls back to
/// a placeholder while the API is not deployed.
export async function fetchStatus(intentHash: string): Promise<StatusResponse> {
  try {
    const res = await fetch(`${NIET.API_URL}/api/intent/status/${intentHash}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return { intentHash, state: "pending", detail: `API ${res.status}` };
    }
    return (await res.json()) as StatusResponse;
  } catch (err) {
    return {
      intentHash,
      state: "pending",
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}
