//! Niet intent + conditions + fallback type system.
//!
//! Wire format is a Niet-defined manual byte packing (see `message.rs`), NOT
//! SCVal XDR — this keeps the Solidity-side encoder tractable. Soroban's
//! `#[contracttype]` only supports unit variants and single-payload tuple
//! variants on enums, hence the wrapper-struct pattern below.

use soroban_sdk::{contracttype, Address, BytesN, Vec};

/// Version of the NietIntent hookData schema. Bumped on any wire-format change.
pub const CURRENT_INTENT_VERSION: u32 = 1;

// ---------- variant payloads ----------

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct BlendSupplyParams {
    pub pool: Address,
    /// Blend V2 Request discriminant. `2` = SupplyCollateral.
    pub request_type: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct RateThresholdParams {
    pub pool: Address,
    pub min_apy_bps: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct TimeBoundParams {
    pub max_stellar_ledger_ts: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct RefundParams {
    pub source_domain: u32,
    pub source_recipient: BytesN<32>,
}

// ---------- variants ----------

/// Post-arrival action executed atomically if conditions pass.
///
/// v1 ships `BlendSupply` only. Phase 2 will add `BlendBorrow`, `SoroswapSwap`,
/// `DefindexDeposit`, `UstblBuy`, `Pay`, `RawSorobanCall`.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum Action {
    BlendSupply(BlendSupplyParams),
}

/// Settlement-time condition primitive. v1 ships `RateThreshold` (state-based) and
/// `TimeBound` (time-based). Phase 2 adds `SlippageCap`, `PoolUtilizationGuard`,
/// `OraclePrice`, and multi-condition AND/OR trees.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum Condition {
    RateThreshold(RateThresholdParams),
    TimeBound(TimeBoundParams),
}

/// What to do when at least one condition fails. Chosen at intent-signing time,
/// executed atomically inside the same Soroban tx that saw the condition fail.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum Fallback {
    /// Burn USDC on Stellar via Circle's TokenMessenger, routing back to
    /// `source_recipient` on `source_domain`.
    Refund(RefundParams),
    /// Transfer USDC to `user_stellar_addr` at rest.
    Hold,
}

/// A composed intent as decoded from CCTP hookData.
///
/// `intent_hash` is a client-computed advisory identifier (Base-side OriginSettler
/// computes it via keccak256(abi.encodePacked(...)) and embeds it here). Rust reads
/// it as opaque for event indexing; no cryptographic re-verification in v1.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct NietIntent {
    pub version: u32,
    pub intent_hash: BytesN<32>,
    pub user_stellar_addr: Address,
    pub action: Action,
    pub conditions: Vec<Condition>,
    pub fallback: Fallback,
}

/// Reason discriminant emitted alongside IntentRefunded / IntentHeld events.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum SettleReason {
    ConditionFailed,
    ActionFailed,
}
