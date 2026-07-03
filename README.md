# Niet

Conditional settlement layer for cross-chain intents on Stellar.

Niet extends Circle's CCTP V2 rail on Stellar with destination-side condition evaluation and atomic DeFi composition. A user (or AI agent) signs one intent on Base; USDC arrives on Stellar, user-specified conditions are evaluated at settlement time, and either the composed action fires (v1: Blend supply) or the pre-declared fallback executes (refund to source, or hold as USDC).

**Testnet verified 2026-07-03.** Hold path proven end-to-end: [Base burn](https://sepolia.basescan.org/tx/0xbfb67fd3d93c0b8d3f836cc9ca1c8feb81044a9a3739e4e7741369de296a7342) → Circle Iris → [Stellar settle](https://stellar.expert/explorer/testnet/tx/d8d7e64b0db63ba360eb5d94afa20beb49791c9157fdffdd62114437101aa44c) in 19 seconds.

## Deployed contracts (testnet)

| Chain | Contract | Address |
|---|---|---|
| Stellar testnet | NietSettler | `CAVJPLSNRHZ35GYCQLNGFDUCMGIYHFHI7SOUBBR2ZL7WCWPOQGDW6AX4` |
| Base Sepolia | OriginSettler | `0x747e90a4e6c5eb39a8e138a3d98794ea3be12e55` |

Full deployment addresses (including Circle CCTP + Blend testnet references) in `deployments/testnet.json`.

## Structure

```
niet/
├── contracts-soroban/    Rust — Soroban destination contracts (NietSettler + day-0 verifier)
├── contracts-base/       Solidity — ERC-7683 OriginSettler on Base
├── ts/
│   ├── relayer/          Iris attestation poller + Stellar submitter (one-shot mode)
│   ├── api/              Hono REST API + OpenAPI (Cloudflare Workers)
│   ├── mcp/              @niet/mcp-server (agent tools)
│   ├── demo/             Next.js 15 demo UI (scaffold — full UI pending)
│   └── examples/         Reference autonomous rebalance agent
├── deployments/          Testnet contract addresses (public)
└── docs/                 SEP-draft, architecture, MCP tool reference, verification memos
```

## Quickstart (testnet)

Requires: Rust + Stellar CLI v26.1+, Foundry, pnpm 8+, Node 20+.

```
git clone --recurse-submodules git@github.com:atahanyild/niet.git
cd niet
pnpm install

# Contracts
cargo test --manifest-path contracts-soroban/Cargo.toml --workspace
forge test --root contracts-base

# One-shot end-to-end Hold path against testnet
# (requires .env.local with BASE_SEPOLIA_PRIVATE_KEY + STELLAR_TESTNET_SECRET)
cd ts/relayer
pnpm dlx tsx scripts/e2e-hold-path.ts
```

## Deeper reading

- `docs/day-0-cctp-verification.md` — Fast Attestation empirical verification
- `docs/testnet-verification.md` — End-to-end path verification memos
- `docs/SEP-DRAFT-intent-conditions.md` — Wire format spec for the intent + conditions payload
- `docs/mcp-tool-reference.md` — MCP tool schemas + agent examples
- `docs/7683-solver-integration.md` — For third-party ERC-7683 solvers

## License

MIT.
