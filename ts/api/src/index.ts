/**
 * Niet REST API — Hono app deployable to Cloudflare Workers.
 *
 * Endpoints:
 *   POST /intent/quote      — condition satisfiability + ETA preview
 *   POST /intent/execute    — returns ABI-encoded orderData + submission instructions
 *   GET  /intent/status/{id}— polls Stellar events (v1: best-effort)
 *
 * Stateless. Idempotent. Deploy: `wrangler deploy`.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { parseEnv } from "./env.js";
import {
  QuoteRequestSchema,
  QuoteResponseSchema,
  ExecuteRequestSchema,
  ExecuteResponseSchema,
  ErrorResponseSchema,
} from "./schemas/intent.js";
import { previewConditions } from "./services/blend-quote.js";
import { computeIntentHashPacked, encodeOrderData, ORDER_DATA_TYPE } from "./services/intent-hash.js";
import { findSettlementEvent } from "./services/stellar.js";

type AppEnv = { Bindings: Record<string, string | undefined> };

const app = new OpenAPIHono<AppEnv>();

// Health
app.get("/", (c) => c.text("Niet API v0.1.0"));
app.get("/health", (c) => c.json({ ok: true }));

// ---------- routes ----------

const quoteRoute = createRoute({
  method: "post",
  path: "/intent/quote",
  request: {
    body: {
      content: { "application/json": { schema: QuoteRequestSchema } },
    },
  },
  responses: {
    200: { description: "Quote preview", content: { "application/json": { schema: QuoteResponseSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

app.openapi(quoteRoute, async (c) => {
  const { intent } = c.req.valid("json");
  const env = parseEnv(c.env as Record<string, string | undefined>);
  const conditionPreview = await previewConditions(intent, env.STELLAR_TESTNET_RPC);
  const cctpFee = BigInt(intent.maxFee);
  const amountIn = BigInt(intent.amount);
  const amountOut = amountIn - cctpFee;
  return c.json(
    {
      amountInMicroUsdc: amountIn.toString(),
      amountOutMicroUsdc: amountOut.toString(),
      cctpFeeMicroUsdc: cctpFee.toString(),
      etaSeconds: { fast: 15, typical: 30, slow: 90 },
      conditionPreview,
    },
    200,
  );
});

const executeRoute = createRoute({
  method: "post",
  path: "/intent/execute",
  request: {
    body: {
      content: { "application/json": { schema: ExecuteRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Execute payload",
      content: { "application/json": { schema: ExecuteResponseSchema } },
    },
    400: { description: "Bad request", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

app.openapi(executeRoute, async (c) => {
  const { intent, userBaseAddress } = c.req.valid("json");
  const env = parseEnv(c.env as Record<string, string | undefined>);
  const orderData = encodeOrderData(intent, env.USDC_BASE_SEPOLIA as `0x${string}`);
  const intentHash = computeIntentHashPacked(
    84532, // Base Sepolia chainId
    env.ORIGIN_SETTLER_ADDRESS as `0x${string}`,
    userBaseAddress as `0x${string}`,
    0n,
    orderData,
  );
  return c.json(
    {
      originSettlerAddress: env.ORIGIN_SETTLER_ADDRESS,
      intentHash,
      orderDataType: ORDER_DATA_TYPE,
      orderData,
      fillDeadline: Math.floor(Date.now() / 1000) + 3600,
      submissionHint: {
        approveUsdc: `cast send ${env.USDC_BASE_SEPOLIA} 'approve(address,uint256)' ${env.ORIGIN_SETTLER_ADDRESS} ${intent.amount} --rpc-url ${env.BASE_SEPOLIA_RPC}`,
        callOpen: `cast send ${env.ORIGIN_SETTLER_ADDRESS} 'open((uint32,bytes32,bytes))' '(<fillDeadline>,${ORDER_DATA_TYPE},${orderData})' --rpc-url ${env.BASE_SEPOLIA_RPC}`,
      },
    },
    200,
  );
});

app.get("/intent/status/:id", async (c) => {
  const env = parseEnv(c.env as Record<string, string | undefined>);
  const intentId = c.req.param("id") as `0x${string}`;
  const found = await findSettlementEvent(env.STELLAR_HORIZON_URL, env.NIET_SETTLER_ID, intentId);
  if (!found) {
    return c.json({ intentHash: intentId, state: "pending" as const });
  }
  return c.json({
    intentHash: intentId,
    state: found.state,
    stellarTxHash: found.txHash,
    stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${found.txHash}`,
  });
});

// ---------- OpenAPI spec + Swagger UI ----------

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: { title: "Niet API", version: "0.1.0" },
});

export default app;
