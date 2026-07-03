//! NietSettler entry point.

use soroban_sdk::{
    contract, contractclient, contractimpl, panic_with_error, token, Address, Bytes, Env,
};

use crate::actions;
use crate::conditions;
use crate::error::NietSettlerError;
use crate::intent::SettleReason;
use crate::message;
use crate::storage::{self, StorageKey};

/// Minimal client interface for Circle's Stellar MessageTransmitter v2.
/// See circlefin/stellar-cctp Receiver trait shape.
#[contractclient(name = "MessageTransmitterClient")]
pub trait MessageTransmitterInterface {
    fn receive_message(env: Env, caller: Address, message: Bytes, attestation: Bytes) -> bool;
}

#[contract]
pub struct NietSettlerContract;

#[contractimpl]
impl NietSettlerContract {
    /// Initialize the contract with roles, external addresses, and expected
    /// protocol versions. Callable exactly once at deployment time.
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        owner: Address,
        pauser: Address,
        rescuer: Address,
        admin: Address,
        message_transmitter: Address,
        token_messenger_minter: Address,
        usdc_token: Address,
        expected_msg_version: u32,
        expected_burn_msg_version: u32,
        expected_intent_version: u32,
    ) {
        if env.storage().instance().has(&StorageKey::MessageTransmitter) {
            panic_with_error!(&env, NietSettlerError::AlreadyInitialized);
        }
        let s = env.storage().instance();
        s.set(&StorageKey::Owner, &owner);
        s.set(&StorageKey::Pauser, &pauser);
        s.set(&StorageKey::Rescuer, &rescuer);
        s.set(&StorageKey::Admin, &admin);
        s.set(&StorageKey::MessageTransmitter, &message_transmitter);
        s.set(&StorageKey::TokenMessengerMinter, &token_messenger_minter);
        s.set(&StorageKey::UsdcToken, &usdc_token);
        s.set(&StorageKey::ExpectedMsgVersion, &expected_msg_version);
        s.set(&StorageKey::ExpectedBurnMsgVersion, &expected_burn_msg_version);
        s.set(&StorageKey::ExpectedIntentVersion, &expected_intent_version);
        s.set(&StorageKey::Paused, &false);
    }

    /// Core entry point. Anyone can invoke — MessageTransmitter's nonce guard
    /// prevents replay. Delivery + condition eval + composed action or
    /// fallback all fire atomically inside this call.
    pub fn mint_and_settle(env: Env, message: Bytes, attestation: Bytes) {
        storage::require_initialized(&env);
        if storage::is_paused(&env) {
            panic_with_error!(&env, NietSettlerError::Paused);
        }

        // Step 1: parse the CCTP message body and hookData without executing
        // the mint yet. This validates the message shape and gives us the
        // intent to evaluate.
        let validated = message::validate_cctp_message(&env, &message);
        let intent = message::decode_niet_intent(&env, &validated.hook_data);

        // Step 2: snapshot our USDC balance before the mint.
        let usdc = storage::get_usdc_token(&env);
        let self_addr = env.current_contract_address();
        let token_client = token::TokenClient::new(&env, &usdc);
        let starting_balance = token_client.balance(&self_addr);

        // Step 3: trigger the mint through Circle's MessageTransmitter. MT
        // routes to TokenMessengerMinter which mints USDC to us (we are
        // mint_recipient). Auth flows through our own contract address.
        let mt = storage::get_message_transmitter(&env);
        let client = MessageTransmitterClient::new(&env, &mt);
        client.receive_message(&self_addr, &message, &attestation);

        let ending_balance = token_client.balance(&self_addr);
        let amount_minted = ending_balance
            .checked_sub(starting_balance)
            .unwrap_or_else(|| panic_with_error!(&env, NietSettlerError::NoTokensMinted));
        if amount_minted <= 0 {
            panic_with_error!(&env, NietSettlerError::NoTokensMinted);
        }

        // Step 4: evaluate conditions AND-joined.
        let conditions_pass = conditions::evaluate_all(
            &env,
            &intent.intent_hash,
            &usdc,
            &intent.conditions,
        );

        // Step 5: route to action or fallback.
        if conditions_pass {
            actions::execute_action(&env, &intent, amount_minted);
        } else {
            actions::execute_fallback(&env, &intent, amount_minted, SettleReason::ConditionFailed);
        }
    }

    // ---------- role management ----------

    pub fn pause(env: Env) {
        storage::require_initialized(&env);
        let pauser = storage::get_pauser(&env);
        pauser.require_auth();
        storage::set_paused(&env, true);
    }

    pub fn unpause(env: Env) {
        storage::require_initialized(&env);
        let pauser = storage::get_pauser(&env);
        pauser.require_auth();
        storage::set_paused(&env, false);
    }

    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    /// Rescue stuck SEP-41 balances (e.g. accidental token deposits). Rescuer-only.
    pub fn rescue(env: Env, token_addr: Address, to: Address, amount: i128) {
        storage::require_initialized(&env);
        let rescuer = storage::get_rescuer(&env);
        rescuer.require_auth();
        let client = token::TokenClient::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &to, &amount);
    }

    pub fn transfer_admin(env: Env, new_admin: Address) {
        storage::require_initialized(&env);
        let admin = storage::get_admin(&env);
        admin.require_auth();
        env.storage().instance().set(&StorageKey::Admin, &new_admin);
    }

    pub fn transfer_ownership(env: Env, new_owner: Address) {
        storage::require_initialized(&env);
        let owner = storage::get_owner(&env);
        owner.require_auth();
        env.storage().instance().set(&StorageKey::Owner, &new_owner);
    }

    // ---------- getters ----------

    pub fn get_owner(env: Env) -> Address { storage::get_owner(&env) }
    pub fn get_pauser(env: Env) -> Address { storage::get_pauser(&env) }
    pub fn get_rescuer(env: Env) -> Address { storage::get_rescuer(&env) }
    pub fn get_admin(env: Env) -> Address { storage::get_admin(&env) }
    pub fn get_message_transmitter(env: Env) -> Address { storage::get_message_transmitter(&env) }
    pub fn get_token_messenger_minter(env: Env) -> Address { storage::get_token_messenger_minter(&env) }
    pub fn get_usdc_token(env: Env) -> Address { storage::get_usdc_token(&env) }

    /// Emit-a-getter for observability. Front-end status polling can read this to
    /// determine which msg/burn/intent versions the contract is currently pinned to.
    pub fn get_expected_versions(env: Env) -> (u32, u32, u32) {
        (
            storage::get_expected_msg_version(&env),
            storage::get_expected_burn_msg_version(&env),
            storage::get_expected_intent_version(&env),
        )
    }

}
