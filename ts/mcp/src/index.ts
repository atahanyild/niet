#!/usr/bin/env node
/**
 * @atahanyild/niet-mcp-server — MCP server exposing Niet's quote + execute tools.
 *
 * Install:
 *   npx @atahanyild/niet-mcp-server
 *
 * Configure your MCP-compatible editor (Claude Code, Cursor) to launch this
 * command; the server communicates over stdio.
 *
 * Env vars:
 *   NIET_API_URL   Base URL of the Niet REST API. Defaults to the production
 *                  Vercel deploy. Override for local dev.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ---------- shared intent schema (mirrors REST) ----------

const IntentSchema = z.object({
  amount: z.string().describe("Micro-USDC amount to bridge (6 decimals as string)"),
  maxFee: z.string().default("500"),
  userStellarAddr: z.string().min(56).max(56),
  action: z.object({
    tag: z.literal("BlendSupply"),
    pool: z.string().min(56).max(56),
    requestType: z.number().int().default(2),
  }),
  fallback: z.union([
    z.object({
      tag: z.literal("Refund"),
      sourceDomain: z.number().int().nonnegative(),
      sourceRecipient: z.string().startsWith("0x").length(66),
    }),
    z.object({ tag: z.literal("Hold") }),
  ]),
  conditions: z.array(
    z.union([
      z.object({
        tag: z.literal("RateThreshold"),
        pool: z.string().min(56).max(56),
        minApyBps: z.number().int().nonnegative(),
      }),
      z.object({
        tag: z.literal("TimeBound"),
        maxStellarLedgerTs: z.number().int().nonnegative(),
      }),
    ]),
  ),
});

const QuoteInputSchema = z.object({
  intent: IntentSchema,
  userBaseAddress: z.string().startsWith("0x").length(42),
});

const ExecuteInputSchema = QuoteInputSchema;

const StatusInputSchema = z.object({
  intentHash: z.string().startsWith("0x").length(66),
});

// ---------- server ----------

const NIET_API_URL =
  process.env.NIET_API_URL ??
  "https://demo-b59axz4dn-atahanyilds-projects.vercel.app";

const server = new Server(
  { name: "@atahanyild/niet-mcp-server", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "niet_quote_intent",
      description:
        "Preview a Niet cross-chain intent: returns projected output amount, CCTP fee, ETA, and per-condition satisfiability against current on-chain state. Does not commit or sign anything.",
      inputSchema: {
        type: "object",
        properties: {
          intent: {
            type: "object",
            description: "Niet intent — see the SEP-draft for the full schema.",
          },
          userBaseAddress: {
            type: "string",
            description: "EVM address (0x…) that will sign the ERC-7683 order.",
          },
        },
        required: ["intent", "userBaseAddress"],
      },
    },
    {
      name: "niet_execute_intent",
      description:
        "Compile a Niet intent into a signable ERC-7683 order. Returns the OriginSettler address on Base Sepolia + the ABI-encoded orderData + submission commands. The client must sign and submit; this tool never takes custody.",
      inputSchema: {
        type: "object",
        properties: {
          intent: { type: "object" },
          userBaseAddress: { type: "string" },
        },
        required: ["intent", "userBaseAddress"],
      },
    },
    {
      name: "niet_status_intent",
      description:
        "Look up the current lifecycle state of an intent by its intent_hash. Returns pending/settled/refunded/held with Stellar tx hash + explorer link.",
      inputSchema: {
        type: "object",
        properties: {
          intentHash: { type: "string" },
        },
        required: ["intentHash"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
  try {
    const name = req.params.name;
    const args = req.params.arguments ?? {};

    if (name === "niet_quote_intent") {
      const parsed = QuoteInputSchema.parse(args);
      const res = await fetch(`${NIET_API_URL}/intent/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    }

    if (name === "niet_execute_intent") {
      const parsed = ExecuteInputSchema.parse(args);
      const res = await fetch(`${NIET_API_URL}/intent/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    }

    if (name === "niet_status_intent") {
      const parsed = StatusInputSchema.parse(args);
      const res = await fetch(`${NIET_API_URL}/intent/status/${parsed.intentHash}`);
      const body = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
