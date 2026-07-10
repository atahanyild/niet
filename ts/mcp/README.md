# @atahanyild/niet-mcp-server

Model Context Protocol server exposing [Niet's](https://github.com/atahanyild/niet) conditional cross-chain intents as first-class agent tools.

An AI agent (Claude Code, Cursor, or any MCP-compatible client) signs one intent on Base; USDC arrives on Stellar; user-specified conditions are evaluated at settlement time; the composed action fires (Blend supply) or the pre-declared fallback executes (refund to source, or hold as USDC).

## Install

**Claude Code:**
```
claude mcp add niet npx @atahanyild/niet-mcp-server
```

**Cursor** — add to `mcp.json`:
```json
{
  "mcpServers": {
    "niet": {
      "command": "npx",
      "args": ["@atahanyild/niet-mcp-server"]
    }
  }
}
```

**Any MCP client** — the server communicates over stdio:
```
npx @atahanyild/niet-mcp-server
```

## Environment

- `NIET_API_URL` — Niet REST API base URL. Defaults to the production deploy: `https://niet-app.vercel.app`. Override for local dev.

## Tools

### `niet_quote_intent`

Preview an intent before signing. Returns projected output, CCTP fee, ETA, and per-condition satisfiability.

### `niet_execute_intent`

Compile an intent into a signable ERC-7683 order. Returns the OriginSettler address + ABI-encoded `orderData` + submission commands. Client-side wallets sign and submit — the server never handles private keys.

### `niet_status_intent`

Poll settlement state by `intent_hash`. Returns `pending | settled | refunded | held` with Stellar tx hash + explorer link.

## Reference agent

The [`ts/examples/conditional-rebalance-agent.ts`](https://github.com/atahanyild/niet/blob/main/ts/examples/src/conditional-rebalance-agent.ts) in the main repo is a runnable end-to-end agent that quotes, gates on APY threshold, and drives execute + status polling.

## Repo

<https://github.com/atahanyild/niet>

## License

MIT.
