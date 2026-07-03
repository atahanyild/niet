# Day-0 CCTP V2 Fast Attestation verification

**Date:** 2026-07-03
**Verdict:** **PRIMARY ARCHITECTURE GREEN LIGHT**
**Attestation latency:** ~12 seconds (Base Sepolia → Iris sandbox → Stellar testnet)

## Question answered

Does Circle's Fast Attestation Service attest CCTP V2 Fast Transfers targeting a **custom** (non-Circle-stock) `mint_recipient` contract on Stellar?

**Yes.** Iris attested our custom contract as `mint_recipient` + `destinationCaller` within 12 seconds. Custom NietSettler-shaped forwarders are viable for the primary architecture.

## Setup

- **Custom mint_recipient:** `CCNCLHUN5OVPVGG3DHXD72TT4MAN2HN5QSQ7J6KPCTKOYVBDI3KI4UKQ` — a Niet-authored Soroban C-contract (`day-0-test-forwarder`) that invokes MessageTransmitter, receives minted USDC, and emits an event with the raw message bytes.
- **destinationCaller:** same as mint_recipient (`CCNC...`)
- **Source:** Base Sepolia (CCTP domain 6)
- **Destination:** Stellar testnet (CCTP domain 27)
- **Burn amount:** 1 USDC (1_000_000 at 6 decimals)
- **hookData:** `0xdeadbeefcafebabe0011223344556677` (arbitrary; verifies the payload channel)
- **`minFinalityThreshold`:** 1000 (Fast Transfer)
- **`maxFee`:** 500 (0.0005 USDC max)

## Execution

Script: `ts/relayer/scripts/day-0-verify.ts`

| Step | Timestamp (relative) | Detail |
|---|---|---|
| Base Sepolia `approve` | t = 0 (setup) | 0x3a7b478b4eaee7965d0e427a28b350f657b6b000633809320d3b0953850a763d |
| Base Sepolia `depositForBurnWithHook` | t = 0 (burn baseline) | 0x11a95c80037bfe6b6734674c4e3f7adb9bd1cc1595d35f393a4d881a584b30dc |
| Burn confirmed | t + 1.3s | block 43656501 |
| Iris polled with `pending_confirmations` | t + 6.4s | one status transition observed |
| Iris returned `complete` with attestation | **t + 12.0s** | 130-byte attestation, 392-byte message |
| Stellar testnet `mint_and_log` submitted | t + ~14s | 13e7d5f157c198a4ce6e5c9e95927a6c66a10ee1ce54b40ba258b4349fae7d1f |
| Stellar tx confirmed successful | t + ~19s | fee charged 0.107 XLM |

**Burn → attested: 12 seconds**
**Burn → minted-on-Stellar: ~19 seconds total**

## Verification receipts

- **Base burn:** https://sepolia.basescan.org/tx/0x11a95c80037bfe6b6734674c4e3f7adb9bd1cc1595d35f393a4d881a584b30dc
- **Stellar mint_and_log:** https://stellar.expert/explorer/testnet/tx/13e7d5f157c198a4ce6e5c9e95927a6c66a10ee1ce54b40ba258b4349fae7d1f
- **Day-0 test contract USDC balance after mint:** `9998700` (7 decimals) = **9.9987 USDC**
  - Circle converted 6-decimal Base USDC (1_000_000) to 7-decimal Stellar USDC (10_000_000)
  - Subtracted 1_300 fee (~0.00013 USDC)
  - Confirms decimal conversion + fee model

## Implications for Niet

1. **Primary architecture confirmed viable.** NietSettler as `mint_recipient` will receive Fast attestation. Full atomic settle-in-one-Soroban-tx pattern lands.
2. **Sub-minute latency achievable.** 19s end-to-end (single tx + poll) beats the SOW's <60s target with 3x margin. Actual production latency will vary with Base finality on burn tx and Stellar network congestion.
3. **hookData carries arbitrary bytes.** The 16-byte test payload was preserved end-to-end. Niet can encode NietIntent XDR here.
4. **Decimal conversion:** Base USDC (6 dec) → Stellar USDC (7 dec) is 10x scaling. NietSettler must account for this when computing amounts passed to action adapters.
5. **Fees are minimal.** ~0.00013 USDC Circle fee + 0.107 XLM Stellar tx fee. Story 1.6 gas-payment note holds: relayer pays, cost absorbed.

## Contingency plan status

Not activated. Contingency (stock CctpForwarder + Niet keeper) remains documented in the architecture as fallback but is not required.

## Next up

Sprint proceeds with Story 1.3: NietSettler contract skeleton, extending the `day-0-test-forwarder` pattern into the full NietSettler with `hookData` NietIntent decoding + ConditionEvaluator + action adapters.
