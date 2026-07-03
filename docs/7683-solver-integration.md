# ERC-7683 Solver Integration Guide

Niet is a destination on Stellar for ERC-7683 orders originating on any EVM chain that Circle CCTP V2 supports. This guide is for third-party ERC-7683 solvers who want to fulfill Niet destination intents.

## Origin-side contract

Niet ships an `IOriginSettler` on Base Sepolia at `0x747e90a4e6c5eb39a8e138a3d98794ea3be12e55`.

## Order format

Solvers accept `OnchainCrossChainOrder` with:

- `fillDeadline` — user-set expiry.
- `orderDataType == keccak256("NietOrderDataV1")` = `0xecf1abc3132a1f1ea681ec9eb7d8fed1700c9c58187db591fac84e3b8bda250e`.
- `orderData` — ABI-encoded `NietTypes.NietOrderData` (see `contracts-base/src/libraries/NietTypes.sol`).

## Fulfillment sequence

There is no filler in v1 — Niet's own OriginSettler handles the source-side CCTP burn, and Circle CCTP + a relayer handle destination-side delivery. A third-party solver's role in v1 is limited to:

1. Batching users, calling `OriginSettler.open(order)` with the user as `msg.sender` (`openFor` gasless orders are Phase 2 — see `GaslessOrdersNotSupported` error).
2. Optionally providing a lightweight relayer that submits `NietSettler.mint_and_settle(message, attestation)` on Stellar for faster settlement.

## Message on the wire

The full flow from a solver's perspective:

1. Get a signed `OnchainCrossChainOrder` from a user.
2. Verify `orderDataType == 0xecf1abc3...` and decode `orderData` as `NietTypes.NietOrderData`.
3. Verify the user has approved USDC to `OriginSettler`.
4. Call `OriginSettler.open(order)` from the user's context.
5. OriginSettler emits `Open(bytes32 orderId, ResolvedCrossChainOrder resolvedOrder)`.
6. Circle CCTP burns USDC, Iris attests, MessageTransmitter mints on Stellar via NietSettler.
7. NietSettler evaluates conditions, executes action or fallback atomically.

## References

- `contracts-base/src/OriginSettler.sol` — Niet's IOriginSettler implementation
- `contracts-base/src/libraries/NietTypes.sol` — `NietOrderData` Solidity struct
- `contracts-base/src/libraries/HookDataCodec.sol` — hookData wire format encoder
- `docs/SEP-DRAFT-intent-conditions.md` — canonical wire format spec

## Phase 2 roadmap

- `openFor` (gasless / EIP-712 signed orders)
- Solver competition / open bidding on destination-side settlement
- Additional destination action types (Soroswap swap, DeFindex deposit, USTBL purchase, arbitrary Soroban call)
- Additional condition primitives (Reflector oracle price, pool utilization, AND/OR trees)
