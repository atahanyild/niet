// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// Niet order + intent type system. These structs are the Solidity mirror of
/// Rust's `NietIntent` and are encoded by users into the ERC-7683 order's
/// `orderData` field. The library `HookDataCodec` converts them into the
/// packed byte format that Rust decodes on the Stellar side.

library NietTypes {
    /// v1 wire-format version. Bumped on any wire-format change.
    uint32 internal constant INTENT_VERSION = 1;

    /// Action tags
    uint8 internal constant ACTION_BLEND_SUPPLY = 0;

    /// Fallback tags
    uint8 internal constant FALLBACK_REFUND = 0;
    uint8 internal constant FALLBACK_HOLD = 1;

    /// Condition tags
    uint8 internal constant COND_RATE_THRESHOLD = 0;
    uint8 internal constant COND_TIME_BOUND = 1;

    /// ERC-7683 order-data type identifier (EIP-712 typehash-ish).
    bytes32 internal constant ORDER_DATA_TYPE_NIET_V1 = keccak256("NietOrderDataV1");

    struct Action {
        /// 0 = BlendSupply
        uint8 tag;
        /// For BlendSupply: Blend pool's Stellar contract ID (32 bytes).
        bytes32 pool;
        /// For BlendSupply: Blend V2 Request discriminant. 2 = SupplyCollateral.
        uint32 requestType;
    }

    struct Fallback {
        /// 0 = Refund, 1 = Hold
        uint8 tag;
        /// For Refund: CCTP source-chain domain to return to (usually the origin domain).
        uint32 sourceDomain;
        /// For Refund: bytes32 recipient on the source chain.
        bytes32 sourceRecipient;
    }

    struct Condition {
        /// 0 = RateThreshold, 1 = TimeBound
        uint8 tag;
        /// For RateThreshold: Blend pool contract ID.
        bytes32 pool;
        /// For RateThreshold: min supply APY in basis points.
        uint32 minApyBps;
        /// For TimeBound: unix seconds; passes iff current Stellar ledger ts <= this.
        uint64 maxStellarLedgerTs;
    }

    /// The full payload embedded in `orderData` of the ERC-7683 order.
    struct NietOrderData {
        /// Address (on Base) of the ERC-20 the user is transferring in.
        address inputToken;
        /// Amount of `inputToken` to bridge.
        uint256 amount;
        /// CCTP maxFee (units of inputToken decimals).
        uint256 maxFee;
        /// 32-byte Stellar contract ID that will receive USDC in the Hold fallback.
        bytes32 userStellarAddr;
        /// Client-generated per-intent nonce (unique per submission). Prevents
        /// replay on the Base side and disambiguates intent_hash for status
        /// polling. Not part of hookData — only used on the Base side.
        uint256 nonce;
        Action action;
        Fallback fbk;
        Condition[] conditions;
    }
}
