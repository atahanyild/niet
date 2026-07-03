//! Typed events emitted by NietSettler. Consumers (relayer, REST API,
//! demo UI) index events by `intent_hash` to look up settlement state.

use soroban_sdk::{symbol_short, Address, BytesN, Env, Symbol};

use crate::intent::SettleReason;

pub fn emit_intent_settled(
    env: &Env,
    intent_hash: &BytesN<32>,
    mint_recipient: &Address,
    amount: i128,
    action_tag: u32,
) {
    let topic: Symbol = symbol_short!("settled");
    env.events()
        .publish((topic, intent_hash.clone()), (mint_recipient.clone(), amount, action_tag));
}

pub fn emit_intent_refunded(
    env: &Env,
    intent_hash: &BytesN<32>,
    source_domain: u32,
    refund_recipient: &BytesN<32>,
    amount: i128,
    reason: SettleReason,
) {
    let topic: Symbol = symbol_short!("refunded");
    env.events().publish(
        (topic, intent_hash.clone()),
        (source_domain, refund_recipient.clone(), amount, reason),
    );
}

pub fn emit_intent_held(
    env: &Env,
    intent_hash: &BytesN<32>,
    user_address: &Address,
    amount: i128,
    reason: SettleReason,
) {
    let topic: Symbol = symbol_short!("held");
    env.events()
        .publish((topic, intent_hash.clone()), (user_address.clone(), amount, reason));
}

/// Per-condition observability. Emitted for every condition evaluated, whether
/// it passed or failed, so agents/UI can debug why an intent took the fallback.
pub fn emit_condition_evaluated(
    env: &Env,
    intent_hash: &BytesN<32>,
    condition_type: u32,
    passed: bool,
) {
    let topic: Symbol = symbol_short!("cond_eval");
    env.events()
        .publish((topic, intent_hash.clone()), (condition_type, passed));
}
