# SEP-XXXX (Draft): Niet Conditional Intent + hookData Format for CCTP V2 on Stellar

## Preamble

```
SEP: XXXX (Draft)
Title: Conditional Intent + hookData Format for CCTP V2 on Stellar
Author: Atahan Yildirim <atahan03@hotmail.com>
Status: Draft
Created: 2026-07-03
Version: 1
Discussion: https://github.com/atahanyild/niet
```

## Simple Summary

A canonical wire format for embedding user-signed conditional intents into Circle CCTP V2 `hookData` on the Stellar side, enabling atomic destination-side composition (DeFi action, refund, or hold) contingent on conditions evaluated at settlement time.

## Motivation

Circle CCTP V2 delivers USDC to arbitrary Soroban C-contracts via the `mint_recipient` field. Any contract can be the recipient and interpret the message's `hookData` however it likes. Without a shared format:

- Agent frameworks and dApps have to negotiate a private format with each destination-side settler.
- ERC-7683 solvers can't fulfill into Stellar destinations because there's no canonical way to encode the destination action.
- Wallets can't preview or safety-check what happens after the mint.

This SEP proposes one format, tightly scoped to the composition primitives Niet ships in v1 (Blend supply, refund, hold, rate/time conditions), with a version byte so v2 can extend without breaking clients.

## Specification

### Layer 1 — hookData outer wrapper

```
bytes  0..4   : magic bytes b"NIET"
bytes  4..8   : schema version (u32 big-endian)
bytes  8..12  : payload length N (u32 big-endian)
bytes 12..12+N: NietIntent payload
```

- Magic bytes distinguish Niet-encoded hookData from Circle's stock `CctpForwarder` format (magic `b"cctp-forward"`). Recipients that only handle one format MUST reject unknown magic.
- Version is monotonically increasing. v1 is the first version defined. Recipients MUST reject unknown versions.
- Length allows trailing bytes for forward compatibility.

### Layer 2 — NietIntent payload (v1)

All multi-byte integers are big-endian. All addresses in the payload are 32-byte contract-ID form (Stellar C-address raw bytes; not strkey-encoded).

```
bytes  0..32 : intent_hash (32)
bytes 32..64 : user_stellar_addr (32) — contract-ID for Hold-fallback delivery
bytes 64..65 : action_tag (u8)
  BlendSupply (0):
    bytes 65..97  : pool contract-ID (32)
    bytes 97..101 : request_type (u32 BE) — Blend Request discriminant
bytes M..M+1 : fallback_tag (u8) (M = end of action)
  Refund (0):
    bytes M+1..M+5   : source_domain (u32 BE)
    bytes M+5..M+37  : source_recipient (32) — bytes32 form on the source chain
  Hold (1):
    (no additional bytes)
bytes K..K+2 : condition_count (u16 BE) (K = end of fallback)
For each condition:
  bytes 0..1 : cond_tag (u8)
  RateThreshold (0):
    bytes 1..33 : pool contract-ID (32)
    bytes 33..37: min_apy_bps (u32 BE)
  TimeBound (1):
    bytes 1..9  : max_stellar_ledger_ts (u64 BE)
```

### Intent hash

`intent_hash` is a client-computed advisory identifier used for event indexing and status lookups. It is not cryptographically bound to the payload contents on the Stellar side; replay safety is provided by Circle's MessageTransmitter nonce.

Suggested computation (Solidity/EVM):

```solidity
intent_hash = keccak256(abi.encodePacked(chainId, originSettler, user, nonce, orderData))
```

## Rationale

### Manual byte packing vs XDR / ABI

XDR is Soroban's native encoding, but Solidity encoders would need to implement full XDR serialization, which is not tractable in a v1 sprint. Solidity ABI encoding is trivial on the source side but produces verbose bytes with type headers that inflate `hookData` size. Manual byte packing matches both languages' native capabilities: Solidity emits with `abi.encodePacked`, Rust decodes with byte-position reads.

### Version byte at the top

Puts version verification before any variable-length decoding. Recipients can reject unknown versions in ~10 bytes of parsing.

### Contract-ID for addresses (not strkey)

Strkey encoding adds 24 bytes per address for zero semantic gain. Contract-ID is 32 bytes and canonically equivalent to strkey. Recipients reconstruct strkey off-chain for display.

### Advisory intent_hash

Cryptographically binding intent_hash to the payload would require Rust to recompute keccak256 over the packed bytes at settlement, adding compute cost. CCTP nonce already prevents replay at the transport layer, so binding here is redundant.

## Backwards Compatibility

None — this is a new format. Version byte enables future extensions without breaking v1 clients.

## Reference Implementation

- Solidity encoder: [`contracts-base/src/libraries/HookDataCodec.sol`](https://github.com/atahanyild/niet/blob/main/contracts-base/src/libraries/HookDataCodec.sol)
- Rust decoder: [`contracts-soroban/contracts/niet-settler/src/message.rs`](https://github.com/atahanyild/niet/blob/main/contracts-soroban/contracts/niet-settler/src/message.rs)
- Golden vectors: [`docs/intent-hash-vectors.json`](https://github.com/atahanyild/niet/blob/main/docs/intent-hash-vectors.json)

## Security Considerations

- The recipient contract MUST verify `magic == "NIET"` and `version` before decoding.
- The recipient contract MUST enforce that CCTP `mint_recipient` equals itself.
- Because `intent_hash` is advisory, malicious source-side actors cannot use it as a covert channel or spoofing surface.
- Version bytes prevent forward compatibility from being exploited: a v2 intent must not be silently interpreted as v1.
- Condition evaluation MUST use on-chain state (Blend pool state, ledger timestamp) — never off-chain oracle data in v1.

## Test Vectors

See `docs/intent-hash-vectors.json` in the reference implementation for byte-exact test vectors that both the Solidity encoder and the Rust decoder produce/accept.
