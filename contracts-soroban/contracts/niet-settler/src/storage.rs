use soroban_sdk::{contracttype, panic_with_error, Address, Env};

use crate::error::NietSettlerError;

/// Instance storage keys. Config only — no per-intent state in v1.
#[contracttype]
pub enum StorageKey {
    /// Stellar-side Circle MessageTransmitter v2 contract address
    MessageTransmitter,
    /// Stellar-side Circle TokenMessengerMinter v2 contract address
    TokenMessengerMinter,
    /// Local USDC SAC address (Circle's Stellar USDC)
    UsdcToken,
    /// Owner (can transfer roles, upgrade)
    Owner,
    /// Pauser (can pause mint_and_settle)
    Pauser,
    /// Rescuer (can move stuck SEP-41 balances)
    Rescuer,
    /// Admin (can update non-critical config)
    Admin,
    /// Paused flag
    Paused,
    /// Expected CCTP MessageV2 protocol version (usually 1)
    ExpectedMsgVersion,
    /// Expected CCTP BurnMessageV2 protocol version (usually 1)
    ExpectedBurnMsgVersion,
    /// Expected NietIntent hookData schema version (v1 = 1)
    ExpectedIntentVersion,
}

pub fn require_initialized(env: &Env) {
    if !env.storage().instance().has(&StorageKey::MessageTransmitter) {
        panic_with_error!(env, NietSettlerError::NotInitialized);
    }
}

pub fn get_message_transmitter(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&StorageKey::MessageTransmitter)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::NotInitialized))
}

pub fn get_token_messenger_minter(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&StorageKey::TokenMessengerMinter)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::NotInitialized))
}

pub fn get_usdc_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&StorageKey::UsdcToken)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::NotInitialized))
}

pub fn get_owner(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&StorageKey::Owner)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::NotInitialized))
}

pub fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&StorageKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::NotInitialized))
}

pub fn get_pauser(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&StorageKey::Pauser)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::NotInitialized))
}

pub fn get_rescuer(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&StorageKey::Rescuer)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::NotInitialized))
}

pub fn get_expected_msg_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&StorageKey::ExpectedMsgVersion)
        .unwrap_or(1)
}

pub fn get_expected_burn_msg_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&StorageKey::ExpectedBurnMsgVersion)
        .unwrap_or(1)
}

pub fn get_expected_intent_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&StorageKey::ExpectedIntentVersion)
        .unwrap_or(1)
}

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&StorageKey::Paused)
        .unwrap_or(false)
}

pub fn set_paused(env: &Env, v: bool) {
    env.storage().instance().set(&StorageKey::Paused, &v);
}
