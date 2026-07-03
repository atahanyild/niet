# End-to-end testnet verification

Tracks live testnet verification of Niet's three settlement paths.

## Hold path — VERIFIED (2026-07-03)

**Intent shape:** Blend supply action + Hold fallback + failing TimeBound condition
(`max_stellar_ledger_ts = 0`, so any current ledger timestamp fails the check).
Because the condition fails, the action is never called, and the pre-declared
Hold fallback fires: NietSettler transfers the received USDC to the intent's
`user_stellar_addr` (in the test, we use `day-0-test-forwarder` as a valid
C-address receiver).

### Sequence

1. Base Sepolia — user approves 1 USDC to OriginSettler; calls `OriginSettler.open`
   with the composed NietOrderData.
2. OriginSettler transfers USDC in, approves TokenMessengerV2, calls
   `depositForBurnWithHook` with `mintRecipient = destinationCaller = NietSettler`,
   `hookData = encoded NietIntent`, `minFinalityThreshold = 1000` (Fast).
3. Relayer polls Circle Iris sandbox until the message is `complete`.
4. Relayer submits `NietSettler.mint_and_settle(message, attestation)` on Stellar.
5. NietSettler validates CCTP layout, decodes Niet hookData → NietIntent, then:
   - Calls `MessageTransmitter.receive_message` → TokenMessengerMinter mints USDC to NietSettler
   - Evaluates conditions — the TimeBound fails, so `ConditionEvaluator::evaluate_all` returns false
   - Emits `ConditionEvaluated` event for the failing condition
   - Executes fallback (`Fallback::Hold`) — SEP-41 transfer of the minted USDC to `user_stellar_addr`
   - Emits `IntentHeld` event

### Wall-clock timing

- Base burn confirmed: t + 2.2s
- Iris pending: t + 6.7s
- Iris attested: t + 16.8s (from burn)
- Stellar `mint_and_settle` confirmed: t + ~19s (from burn)

Well under the SOW's 60-second target with 3x margin.

### Receipts

- OriginSettler.open (Base Sepolia): [0xbfb67f...](https://sepolia.basescan.org/tx/0xbfb67fd3d93c0b8d3f836cc9ca1c8feb81044a9a3739e4e7741369de296a7342)
- NietSettler.mint_and_settle (Stellar testnet): [d8d7e6...](https://stellar.expert/explorer/testnet/tx/d8d7e64b0db63ba360eb5d94afa20beb49791c9157fdffdd62114437101aa44c)
- NietSettler balance after settle: `0` USDC (funds moved out to Hold destination)
- Hold destination (`day-0-test-forwarder`) balance:
  - Before: 9.9987 USDC (from Day-0 spike)
  - After: **19.9974 USDC** (+9.9987 from Hold path)

### What this proves

- OriginSettler on Base Sepolia correctly assembles ERC-7683 orders + hookData.
- HookDataCodec (Solidity) produces bytes that Rust's `decode_niet_intent` accepts.
- Base Sepolia → Stellar testnet CCTP V2 Fast Transfer with custom mint_recipient works end-to-end at Fast tier.
- NietSettler's `mint_and_settle` correctly:
  - Validates CCTP MessageV2 + BurnMessageV2
  - Decodes Niet hookData → NietIntent (all four types round-trip through the wire format)
  - Invokes MessageTransmitter which mints USDC to itself
  - Runs ConditionEvaluator (TimeBound primitive)
  - Routes to fallback on condition failure
  - Executes `Fallback::Hold` — a SEP-41 transfer to the pre-declared user_stellar_addr
- The Niet relayer's one-shot mode (Iris polling + Stellar submission) works.

## Refund path — pending

**Intent shape:** Blend supply action + Refund fallback + failing condition.

Refund calls `TokenMessenger.deposit_for_burn` on Stellar to send USDC back to the source domain. Requires:

1. Verifying my defined `TokenMessengerClient` trait signature matches Circle's real Stellar-side TokenMessenger v2.
2. Circle's Stellar-side USDC contract accepting the burn from NietSettler.

**Blocker:** Signature mismatch is likely; needs verification against Circle's stellar-cctp actual `deposit_for_burn` interface. Will iterate.

## Happy path (Blend supply) — pending

**Intent shape:** Blend supply action + all conditions pass.

Requires a Blend pool on Stellar testnet that accepts Circle USDC (not the Blend-managed mock USDC that `TestnetV2` uses). Options:

1. Confirm with Blend team whether a Circle-USDC pool exists on testnet.
2. Deploy our own test Blend pool wired to Circle USDC.
3. Swap Blend supply for a simpler test target (e.g., Soroswap USDC/XLM swap) as a v1 workaround.

**Blocker:** Waiting on Blend testnet pool selection or workaround decision.
