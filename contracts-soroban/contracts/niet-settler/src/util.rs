//! Address <-> bytes32 conversions.
//!
//! CCTP messages carry 32-byte address representations (matching EVM's bytes32
//! convention). Soroban Addresses are richer (accounts vs contracts). These
//! helpers convert between the two representations using soroban-sdk's
//! `hazmat-address-utils` feature.

use soroban_sdk::{
    address_payload::AddressPayload, panic_with_error, Address, BytesN, Env,
};

use crate::error::NietSettlerError;

/// Convert a Soroban `Address` (either account or contract) to its 32-byte
/// representation as carried in CCTP message fields.
pub fn address_to_bytes32(env: &Env, addr: &Address) -> BytesN<32> {
    match addr.to_payload() {
        Some(AddressPayload::ContractIdHash(id)) => id,
        Some(AddressPayload::AccountIdPublicKeyEd25519(pk)) => pk,
        _ => panic_with_error!(env, NietSettlerError::InvalidMintRecipient),
    }
}

/// Reconstruct an `Address` from its 32-byte contract-ID form. Used to decode
/// pool/user addresses out of Niet's hookData wire format. v1 restricts these
/// fields to contract addresses (C-strkeys); accounts would need a distinct
/// address-type byte in the wire format.
pub fn contract_bytes32_to_address(env: &Env, id: &BytesN<32>) -> Address {
    Address::from_payload(env, AddressPayload::ContractIdHash(id.clone()))
}
