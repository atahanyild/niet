//! ConditionEvaluator — evaluates v1 condition primitives against on-chain state.
//!
//! v1 primitives:
//!   * `RateThreshold` — reads current Blend pool supply APY.
//!   * `TimeBound`     — reads Stellar ledger timestamp.
//!
//! Vec<Condition> is AND-joined: all must pass for the composed action to fire.
//! Empty vec is treated as true (unconstrained intent).

use soroban_sdk::{contractclient, panic_with_error, Address, BytesN, Env, Vec};

use crate::error::NietSettlerError;
use crate::events;
use crate::intent::{Condition, RateThresholdParams, TimeBoundParams};

/// Condition type discriminant for the ConditionEvaluated event.
pub const COND_TAG_RATE_THRESHOLD: u32 = 0;
pub const COND_TAG_TIME_BOUND: u32 = 1;

/// Minimal client trait for Blend Pool. Only the calls we need for v1 conditions.
///
/// This matches Blend V2's exposed pool interface for reading supply-side APY.
/// If Blend's public method name differs (e.g. `get_reserve`, `get_apr`), we
/// swap this shim at integration time without touching the settle flow.
#[contractclient(name = "BlendPoolClient")]
pub trait BlendPoolInterface {
    /// Returns the current supply APR in basis points (10_000 = 100%).
    fn supply_apy_bps(env: Env, asset: Address) -> u32;
}

/// Evaluate all conditions AND-joined. Returns `true` iff every condition passes.
/// Emits a `ConditionEvaluated` event for each. Short-circuits: as soon as one
/// condition fails, remaining ones are not evaluated.
pub fn evaluate_all(
    env: &Env,
    intent_hash: &BytesN<32>,
    usdc_token: &Address,
    conditions: &Vec<Condition>,
) -> bool {
    for c in conditions.iter() {
        let (tag, ok) = match c {
            Condition::RateThreshold(params) => {
                let ok = eval_rate_threshold(env, &params, usdc_token);
                (COND_TAG_RATE_THRESHOLD, ok)
            }
            Condition::TimeBound(params) => {
                let ok = eval_time_bound(env, &params);
                (COND_TAG_TIME_BOUND, ok)
            }
        };
        events::emit_condition_evaluated(env, intent_hash, tag, ok);
        if !ok {
            return false;
        }
    }
    true
}

fn eval_rate_threshold(env: &Env, params: &RateThresholdParams, usdc_token: &Address) -> bool {
    let client = BlendPoolClient::new(env, &params.pool);
    let apy = client
        .try_supply_apy_bps(usdc_token)
        .unwrap_or_else(|_| panic_with_error!(env, NietSettlerError::PoolReadFailed))
        .unwrap_or_else(|_| panic_with_error!(env, NietSettlerError::PoolReadFailed));
    apy >= params.min_apy_bps
}

fn eval_time_bound(env: &Env, params: &TimeBoundParams) -> bool {
    env.ledger().timestamp() <= params.max_stellar_ledger_ts
}
