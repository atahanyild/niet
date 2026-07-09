# Niet MCP Tool Reference

`@atahanyild/niet-mcp-server` v0.1.0. See `ts/mcp/README.md` for installation.

## Tools

### `niet_quote_intent`

Preview a Niet cross-chain intent without committing anything.

**Input:**
```json
{
  "intent": { "amount": "1000000", "maxFee": "500", "userStellarAddr": "C...", "action": {"tag":"BlendSupply","pool":"C...","requestType":2}, "fallback": {"tag":"Hold"}, "conditions": [{"tag":"RateThreshold","pool":"C...","minApyBps":450}] },
  "userBaseAddress": "0x..."
}
```

**Output:**
```json
{
  "amountInMicroUsdc": "1000000",
  "amountOutMicroUsdc": "999500",
  "cctpFeeMicroUsdc": "500",
  "etaSeconds": { "fast": 15, "typical": 30, "slow": 90 },
  "conditionPreview": [
    { "tag": "RateThreshold", "satisfiable": true, "note": "Pool APY read not wired in v1 REST." }
  ]
}
```

### `niet_execute_intent`

Compile an intent into a signable ERC-7683 order.

**Input:** same shape as `niet_quote_intent`.

**Output:**
```json
{
  "originSettlerAddress": "0x747e...",
  "intentHash": "0xabcd...",
  "orderDataType": "0xecf1...",
  "orderData": "0x...",
  "fillDeadline": 1783087468,
  "submissionHint": {
    "approveUsdc": "cast send 0x036CbD... 'approve(address,uint256)' 0x747e... 1000000 ...",
    "callOpen": "cast send 0x747e... 'open((uint32,bytes32,bytes))' '(1783087468,0xecf1...,0x...)' ..."
  }
}
```

Client-side wallet signs the two shown calls. The MCP server never handles private keys.

### `niet_status_intent`

Poll settlement state by `intent_hash`.

**Input:** `{ "intentHash": "0x..." }`

**Output:** one of:
- `{ "intentHash": "0x...", "state": "pending" }`
- `{ "intentHash": "0x...", "state": "settled" | "refunded" | "held", "stellarTxHash": "abc...", "stellarExpertUrl": "https://..." }`

## Reference agent

See `ts/examples/src/conditional-rebalance-agent.ts` for a runnable end-to-end agent that quotes, executes, and polls status.
