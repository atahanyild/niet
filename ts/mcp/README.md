# @niet/mcp-server

Model Context Protocol server exposing Niet's conditional cross-chain intents as first-class agent tools.

## Install

Claude Code:
```
claude mcp add niet npx @niet/mcp-server
```

Cursor `mcp.json`:
```json
{
  "mcpServers": {
    "niet": {
      "command": "npx",
      "args": ["@niet/mcp-server"]
    }
  }
}
```

## Tools

### `niet_quote_intent`

Preview an intent before signing. Returns projected output, CCTP fee, ETA, and per-condition satisfiability.

### `niet_execute_intent`

Compile an intent into a signable ERC-7683 order. Returns the OriginSettler address + ABI-encoded `orderData` + submission commands. Client-side wallets sign and submit.

### `niet_status_intent`

Poll settlement state by `intent_hash`. Returns `pending | settled | refunded | held` with Stellar tx hash + explorer link.

## Env

- `NIET_API_URL` — Niet REST API base URL. Defaults to production; override for local dev.

## Reference agent

See `@niet/examples` for a runnable autonomous conditional rebalancing agent using these tools.
