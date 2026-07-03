/**
 * Reference autonomous conditional rebalance agent.
 *
 * Demonstrates using Niet's REST/MCP interface to rebalance USDC into Blend
 * when the pool's supply APY crosses a user-defined threshold. Illustrative;
 * production agents would add error handling, retries, and audit logging.
 *
 * Run:
 *   NIET_API_URL=... USER_BASE_ADDR=0x... USER_STELLAR_ADDR=C... tsx conditional-rebalance-agent.ts
 */

const NIET_API_URL = process.env.NIET_API_URL ?? "http://localhost:8787";
const USER_BASE_ADDR = process.env.USER_BASE_ADDR;
const USER_STELLAR_ADDR = process.env.USER_STELLAR_ADDR;
const BLEND_POOL = process.env.BLEND_POOL ?? "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF";
const AMOUNT_USDC_MICRO = process.env.AMOUNT_MICRO ?? "1000000"; // 1 USDC
const MIN_APY_BPS = Number(process.env.MIN_APY_BPS ?? "450"); // 4.5%

interface QuoteResponse {
  amountInMicroUsdc: string;
  amountOutMicroUsdc: string;
  cctpFeeMicroUsdc: string;
  etaSeconds: { fast: number; typical: number; slow: number };
  conditionPreview: Array<{ tag: string; satisfiable: boolean; note?: string }>;
}

interface ExecuteResponse {
  originSettlerAddress: string;
  intentHash: string;
  orderDataType: string;
  orderData: string;
  fillDeadline: number;
  submissionHint: { approveUsdc: string; callOpen: string };
}

async function main(): Promise<void> {
  if (!USER_BASE_ADDR || !USER_STELLAR_ADDR) {
    console.error("Set USER_BASE_ADDR and USER_STELLAR_ADDR env vars");
    process.exit(1);
  }

  const intent = {
    amount: AMOUNT_USDC_MICRO,
    maxFee: "500",
    userStellarAddr: USER_STELLAR_ADDR,
    action: {
      tag: "BlendSupply" as const,
      pool: BLEND_POOL,
      requestType: 2,
    },
    fallback: { tag: "Hold" as const },
    conditions: [
      {
        tag: "RateThreshold" as const,
        pool: BLEND_POOL,
        minApyBps: MIN_APY_BPS,
      },
    ],
  };

  console.log("[quote] requesting quote from Niet API...");
  const quoteRes = await fetch(`${NIET_API_URL}/intent/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent, userBaseAddress: USER_BASE_ADDR }),
  });
  const quote = (await quoteRes.json()) as QuoteResponse;

  console.log("[quote]", JSON.stringify(quote, null, 2));

  const rateOk = quote.conditionPreview.find((c) => c.tag === "RateThreshold")?.satisfiable ?? true;
  if (!rateOk) {
    console.log(`[decision] APY threshold ${MIN_APY_BPS}bps not met — skipping this tick.`);
    return;
  }

  console.log("[execute] requesting signable order from Niet API...");
  const execRes = await fetch(`${NIET_API_URL}/intent/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent, userBaseAddress: USER_BASE_ADDR }),
  });
  const exec = (await execRes.json()) as ExecuteResponse;

  console.log("[execute] Sign + submit these two txs from your wallet:");
  console.log("  1)", exec.submissionHint.approveUsdc);
  console.log("  2)", exec.submissionHint.callOpen);
  console.log("[execute] intentHash:", exec.intentHash);
  console.log(
    "[execute] Poll status via: GET",
    `${NIET_API_URL}/intent/status/${exec.intentHash}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
