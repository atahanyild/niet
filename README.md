# Niet

Conditional settlement layer for cross-chain intents on Stellar.

Niet extends Circle's CCTP V2 rail on Stellar with destination-side condition evaluation and atomic DeFi composition. A user signs one intent on Base; USDC arrives on Stellar, conditions are evaluated at settlement time, and the composed action fires (or the pre-declared fallback: refund to source, or hold as USDC).

## Status

Sprint kickoff. Day-0 CCTP Fast Attestation verification pending.

## Structure

```
niet/
├── contracts-soroban/    Rust — Soroban destination contracts (NietSettler)
├── contracts-base/       Solidity — ERC-7683 OriginSettler on Base
├── ts/
│   ├── relayer/          Iris attestation poller + Stellar submitter
│   ├── api/              Hono REST + OpenAPI (Cloudflare Workers)
│   ├── mcp/              @niet/mcp-server (agent tools)
│   ├── demo/             Next.js 15 demo UI
│   └── examples/         Reference agent script
└── docs/                 SEP-draft, architecture, MCP tool reference
```

## Development

Requires: Rust + Stellar CLI (v26.1+), Foundry, pnpm 8+, Node 20+.

```
pnpm install
cargo check --workspace --manifest-path contracts-soroban/Cargo.toml
forge build --root contracts-base
```

## License

MIT.
