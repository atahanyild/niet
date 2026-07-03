//! Action + Fallback adapters — v1 destination executions.
//!
//! Happy path:
//!   * `BlendSupply` — call `pool.submit(SupplyCollateral)`.
//!
//! Fallbacks:
//!   * `Refund` — Stellar-side CCTP burn back to `source_domain` / `source_recipient`.
//!   * `Hold`   — plain SEP-41 transfer to the intent's `user_stellar_addr`.

use soroban_sdk::{
    contractclient, contracttype, panic_with_error, token, Address, BytesN, Env, Val, Vec,
};

use crate::error::NietSettlerError;
use crate::events;
use crate::intent::{Action, BlendSupplyParams, Fallback, NietIntent, RefundParams, SettleReason};
use crate::storage;

pub const ACTION_TAG_BLEND_SUPPLY: u32 = 0;

// ---------- Blend Pool client (submit(Request[])) ----------

/// Blend V2 Request struct. `request_type` = 2 → SupplyCollateral.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlendRequest {
    pub request_type: u32,
    pub address: Address,
    pub amount: i128,
}

#[contractclient(name = "BlendPoolSubmitClient")]
pub trait BlendPoolSubmitInterface {
    fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<BlendRequest>,
    ) -> Val;
}

// ---------- CCTP source-side burn (for Refund) ----------

/// Minimal client for Stellar-side Circle TokenMessengerV2 `deposit_for_burn`.
/// Used by Refund to send USDC back to the source domain.
#[contractclient(name = "TokenMessengerClient")]
pub trait TokenMessengerInterface {
    fn deposit_for_burn(
        env: Env,
        depositor: Address,
        amount: i128,
        destination_domain: u32,
        mint_recipient: BytesN<32>,
        burn_token: Address,
    ) -> Val;
}

// ---------- Dispatch ----------

/// Execute the happy-path action. Called only when all conditions pass.
pub fn execute_action(env: &Env, intent: &NietIntent, amount: i128) {
    match &intent.action {
        Action::BlendSupply(params) => {
            blend_supply(env, params, amount);
            events::emit_intent_settled(
                env,
                &intent.intent_hash,
                &env.current_contract_address(),
                amount,
                ACTION_TAG_BLEND_SUPPLY,
            );
        }
    }
}

/// Execute the fallback path. Called when any condition fails, or when we
/// deliberately route around the action.
pub fn execute_fallback(env: &Env, intent: &NietIntent, amount: i128, reason: SettleReason) {
    match &intent.fallback {
        Fallback::Refund(params) => {
            refund(env, params, amount);
            events::emit_intent_refunded(
                env,
                &intent.intent_hash,
                params.source_domain,
                &params.source_recipient,
                amount,
                reason,
            );
        }
        Fallback::Hold => {
            hold(env, &intent.user_stellar_addr, amount);
            events::emit_intent_held(
                env,
                &intent.intent_hash,
                &intent.user_stellar_addr,
                amount,
                reason,
            );
        }
    }
}

// ---------- Blend supply ----------

fn blend_supply(env: &Env, params: &BlendSupplyParams, amount: i128) {
    let usdc = storage::get_usdc_token(env);
    let self_addr = env.current_contract_address();

    // Approve pool to pull USDC from us.
    let token_client = token::TokenClient::new(env, &usdc);
    let expiration = env.ledger().sequence() + 100;
    token_client.approve(&self_addr, &params.pool, &amount, &expiration);

    let request = BlendRequest {
        request_type: params.request_type,
        address: usdc.clone(),
        amount,
    };
    let mut requests = Vec::new(env);
    requests.push_back(request);

    let pool_client = BlendPoolSubmitClient::new(env, &params.pool);
    let _ = pool_client
        .try_submit(&self_addr, &self_addr, &self_addr, &requests)
        .unwrap_or_else(|_| panic_with_error!(env, NietSettlerError::BlendSupplyFailed));
}

// ---------- Refund (Stellar-side CCTP burn) ----------

fn refund(env: &Env, params: &RefundParams, amount: i128) {
    let usdc = storage::get_usdc_token(env);
    let self_addr = env.current_contract_address();
    let tmm = storage::get_token_messenger_minter(env);

    // Approve TMM to pull USDC from us for burn.
    let token_client = token::TokenClient::new(env, &usdc);
    let expiration = env.ledger().sequence() + 100;
    token_client.approve(&self_addr, &tmm, &amount, &expiration);

    let client = TokenMessengerClient::new(env, &tmm);
    let _ = client
        .try_deposit_for_burn(
            &self_addr,
            &amount,
            &params.source_domain,
            &params.source_recipient,
            &usdc,
        )
        .unwrap_or_else(|_| panic_with_error!(env, NietSettlerError::RefundBurnFailed));
}

// ---------- Hold (SEP-41 transfer) ----------

fn hold(env: &Env, user_addr: &Address, amount: i128) {
    let usdc = storage::get_usdc_token(env);
    let self_addr = env.current_contract_address();
    let token_client = token::TokenClient::new(env, &usdc);

    let _ = token_client
        .try_transfer(&self_addr, user_addr, &amount)
        .unwrap_or_else(|_| panic_with_error!(env, NietSettlerError::HoldTransferFailed));
}
