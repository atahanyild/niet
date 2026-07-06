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

## Refund path — VERIFIED (2026-07-04)

**Intent shape:** Blend supply action + Refund fallback + failing TimeBound(0) condition.

After fixing the `TokenMessengerClient` trait signature to match Circle's Stellar-side TokenMessengerMinter v2 (added `destination_caller`, `max_fee`, `min_finality_threshold` args), NietSettler was redeployed at `CC3F2ZF7SM6GT7EYWPXULBJWDHNHMYEL3VFJ3A5HRORJ7PHFKNBOWULE`. A new OriginSettler pointing at v2 was deployed at `0x603aba4676a2e51cd12175fc2306991cdc727766`.

### Sequence

1. Base Sepolia `OriginSettler.open` with intent (Refund fallback, source_recipient = user's bytes32).
2. Iris attests in seconds.
3. NietSettler `mint_and_settle`:
   - CCTP MessageTransmitter dispatches to TokenMessengerMinter → USDC minted to NietSettler.
   - ConditionEvaluator: TimeBound(0) fails → returns false.
   - Fallback::Refund fires → NietSettler calls `TokenMessenger.deposit_for_burn` on Stellar side with `max_fee = amount/100`, `min_finality_threshold = 1000`, `destination_caller = zero bytes32`.
   - USDC burned from NietSettler on Stellar.
   - MessageTransmitter emits outgoing MessageSent.

### Receipts

- Base burn (source-side): [0xcb9df5...](https://sepolia.basescan.org/tx/0xcb9df5197c8e9fb36a34bd00d9bec064f6786ae42f499d7154069abbad9c8fd6)
- Stellar mint_and_settle: [fa48c8...](https://stellar.expert/explorer/testnet/tx/fa48c88614d44f9eb37e744f594cefda09a268a63ec3af32412f03997a6f9573)
- Four CCTP events observed in the same Stellar tx:
  - `mint_and_withdraw` (TMM) — incoming USDC minted
  - `message_received` (MT) — inbound CCTP message accepted
  - `cond_eval` (NietSettler) — condition evaluated as false
  - `refunded` (NietSettler) — Fallback::Refund event
  - `deposit_for_burn` (TMM) — outgoing USDC burn back to Base
  - `message_sent` (MT) — outgoing CCTP message queued for Iris attestation

### Second leg (optional)

To complete the round-trip, the outgoing CCTP message needs to be attested by Iris (Stellar domain 27 as source) and submitted to Base's MessageTransmitter to mint USDC back to the user. That's out of scope for the initial refund verification since the NietSettler side is proven; it's a standard CCTP relayer operation.

## Happy path (Blend supply) — pending

**Intent shape:** Blend supply action + all conditions pass.

Requires a Blend pool on Stellar testnet that accepts Circle USDC (not the Blend-managed mock USDC that `TestnetV2` uses). Options:

1. Confirm with Blend team whether a Circle-USDC pool exists on testnet.
2. Deploy our own test Blend pool wired to Circle USDC.
3. Swap Blend supply for a simpler test target (e.g., Soroswap USDC/XLM swap) as a v1 workaround.

**Blocker:** Waiting on Blend testnet pool selection or workaround decision.
