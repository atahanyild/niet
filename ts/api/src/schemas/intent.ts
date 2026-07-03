import { z } from "@hono/zod-openapi";

export const ActionSchema = z.discriminatedUnion("tag", [
  z.object({
    tag: z.literal("BlendSupply"),
    pool: z.string().min(56).max(56).describe("Blend pool Stellar contract ID"),
    requestType: z.number().int().default(2).describe("Blend V2 Request discriminant (2=SupplyCollateral)"),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const ConditionSchema = z.discriminatedUnion("tag", [
  z.object({
    tag: z.literal("RateThreshold"),
    pool: z.string().min(56).max(56),
    minApyBps: z.number().int().nonnegative(),
  }),
  z.object({
    tag: z.literal("TimeBound"),
    maxStellarLedgerTs: z.number().int().nonnegative(),
  }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

export const FallbackSchema = z.discriminatedUnion("tag", [
  z.object({
    tag: z.literal("Refund"),
    sourceDomain: z.number().int().nonnegative(),
    sourceRecipient: z.string().startsWith("0x").length(66),
  }),
  z.object({ tag: z.literal("Hold") }),
]);
export type Fallback = z.infer<typeof FallbackSchema>;

export const IntentSchema = z.object({
  amount: z.string().describe("Amount in USDC 6-decimal micro-units, as string"),
  maxFee: z.string().default("500"),
  userStellarAddr: z.string().min(56).max(56).describe("Stellar C-contract address for Hold fallback"),
  action: ActionSchema,
  fallback: FallbackSchema,
  conditions: z.array(ConditionSchema),
});
export type Intent = z.infer<typeof IntentSchema>;

export const QuoteRequestSchema = z.object({
  intent: IntentSchema,
  userBaseAddress: z.string().startsWith("0x").length(42),
});

export const QuoteResponseSchema = z.object({
  amountInMicroUsdc: z.string(),
  amountOutMicroUsdc: z.string().describe("After Circle CCTP fee"),
  cctpFeeMicroUsdc: z.string(),
  etaSeconds: z.object({
    fast: z.number(),
    typical: z.number(),
    slow: z.number(),
  }),
  conditionPreview: z.array(
    z.object({
      tag: z.string(),
      satisfiable: z.boolean(),
      current: z.string().optional().describe("Current on-chain value if readable"),
      note: z.string().optional(),
    }),
  ),
});

export const ExecuteRequestSchema = z.object({
  intent: IntentSchema,
  userBaseAddress: z.string().startsWith("0x").length(42),
});

export const ExecuteResponseSchema = z.object({
  originSettlerAddress: z.string(),
  intentHash: z.string(),
  orderDataType: z.string(),
  orderData: z.string().describe("ABI-encoded NietOrderData, ready to pass to OriginSettler.open"),
  fillDeadline: z.number(),
  submissionHint: z.object({
    approveUsdc: z.string().describe("First: approve USDC to OriginSettler"),
    callOpen: z.string().describe("Then: call OriginSettler.open with the resolved order tuple"),
  }),
});

export const StatusResponseSchema = z.object({
  intentHash: z.string(),
  state: z.enum(["pending", "settled", "refunded", "held"]),
  stellarTxHash: z.string().optional(),
  stellarExpertUrl: z.string().optional(),
  basescanUrl: z.string().optional(),
  detail: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
