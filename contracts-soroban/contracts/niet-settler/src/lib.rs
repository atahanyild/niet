#![no_std]

//! Niet Settler — conditional settlement layer entry point on Stellar.
//!
//! End-to-end flow:
//! 1. Circle Iris attests a CCTP V2 message where `mint_recipient` == this contract
//!    and `destination_caller` == this contract.
//! 2. Anyone calls `mint_and_settle(message, attestation)` on this contract.
//! 3. `message.rs` validates CCTP layout, decodes `hookData` into a `NietIntent`.
//! 4. `conditions.rs` evaluates the intent's condition list against on-chain state.
//! 5. `actions.rs` runs the composed action if conditions pass, or the pre-declared
//!    fallback (refund via Stellar-side CCTP burn, or hold via SEP-41 transfer)
//!    if any condition fails.
//! 6. Everything happens atomically within a single Soroban transaction.

pub mod actions;
pub mod conditions;
pub mod contract;
pub mod error;
pub mod events;
pub mod intent;
pub mod message;
pub mod storage;
pub mod util;

#[cfg(test)]
mod test;
