#![no_std]

//! Day-0 CCTP verification test contract.
//!
//! Minimal C-contract that acts as `mint_recipient` and `destination_caller` for a Base
//! Sepolia -> Stellar testnet CCTP V2 Fast Transfer. Its sole purpose is to verify that
//! Circle's Fast Attestation Service will attest transfers targeting a non-stock
//! `mint_recipient`. Not production-adjacent.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, token, Address, Bytes, Env,
};

#[contracttype]
pub enum DataKey {
    MessageTransmitter,
    UsdcToken,
    Admin,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Day0Error {
    NotInitialized = 1,
    NoTokensMinted = 2,
    AlreadyInitialized = 3,
}

/// Minimal client interface for Circle's Stellar MessageTransmitter v2.
///
/// Mirrors the `Receiver` trait shape from `circlefin/stellar-cctp` without
/// importing the full package.
#[contractclient(name = "MessageTransmitterClient")]
pub trait MessageTransmitterInterface {
    fn receive_message(env: Env, caller: Address, message: Bytes, attestation: Bytes) -> bool;
}

#[contract]
pub struct Day0TestForwarder;

#[contractimpl]
impl Day0TestForwarder {
    /// Initialize the contract with the MessageTransmitter and USDC SAC addresses.
    pub fn __constructor(env: Env, message_transmitter: Address, usdc_token: Address, admin: Address) {
        if env
            .storage()
            .instance()
            .has(&DataKey::MessageTransmitter)
        {
            panic_with_error!(&env, Day0Error::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::MessageTransmitter, &message_transmitter);
        env.storage()
            .instance()
            .set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Accept a CCTP V2 attested message. This contract must be the message's
    /// `mint_recipient` AND `destination_caller`.
    ///
    /// Flow:
    ///   1. Balance-check own USDC balance before
    ///   2. Call MessageTransmitter.receive_message(self, message, attestation)
    ///      -> MT dispatches to TokenMessengerMinter -> mints USDC to us
    ///   3. Balance-check after; compute minted amount
    ///   4. Emit `day0_mint` event carrying the raw message (so hookData can be
    ///      inspected off-chain)
    pub fn mint_and_log(env: Env, message: Bytes, attestation: Bytes) {
        let mt: Address = env
            .storage()
            .instance()
            .get(&DataKey::MessageTransmitter)
            .unwrap_or_else(|| panic_with_error!(&env, Day0Error::NotInitialized));
        let usdc: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .unwrap_or_else(|| panic_with_error!(&env, Day0Error::NotInitialized));
        let self_addr = env.current_contract_address();

        let usdc_client = token::TokenClient::new(&env, &usdc);
        let starting_balance = usdc_client.balance(&self_addr);

        MessageTransmitterClient::new(&env, &mt).receive_message(&self_addr, &message, &attestation);

        let ending_balance = usdc_client.balance(&self_addr);
        let amount_minted = ending_balance.checked_sub(starting_balance).unwrap_or(0);
        if amount_minted <= 0 {
            panic_with_error!(&env, Day0Error::NoTokensMinted);
        }

        env.events()
            .publish((symbol_short!("day0_mint"),), (message, amount_minted));
    }

    /// Read-only helper to inspect our USDC balance.
    pub fn balance(env: Env) -> i128 {
        let usdc: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .unwrap_or_else(|| panic_with_error!(&env, Day0Error::NotInitialized));
        token::TokenClient::new(&env, &usdc).balance(&env.current_contract_address())
    }

    pub fn get_message_transmitter(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::MessageTransmitter)
            .unwrap_or_else(|| panic_with_error!(&env, Day0Error::NotInitialized))
    }

    pub fn get_usdc_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .unwrap_or_else(|| panic_with_error!(&env, Day0Error::NotInitialized))
    }
}
