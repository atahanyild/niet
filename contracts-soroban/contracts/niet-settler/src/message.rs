//! CCTP V2 message validation + Niet hookData decoding.
//!
//! Niet hookData wire format (v1):
//!
//! ```text
//! bytes  0..4   : magic bytes b"NIET"
//! bytes  4..8   : schema version (u32 big-endian)
//! bytes  8..12  : payload length N (u32 big-endian)
//! bytes 12..12+N: NietIntent packed bytes (see decode_intent_payload)
//! ```
//!
//! The packed NietIntent payload is a compact TLV-like layout designed to be cheap
//! for both Solidity (source-side encoder) and Rust (destination-side decoder):
//!
//! ```text
//! bytes  0..1  : action_tag (u8) — 0 = BlendSupply
//!   BlendSupply payload:
//!     bytes  1..33 : pool contract-ID (32)
//!     bytes 33..37 : request_type (u32 BE)
//! ...
//! ```
//!
//! Full packed layout is spelled out in `docs/SEP-DRAFT-intent-conditions.md`
//! (Story 4.2). This file is the reference decoder; Solidity encoder in Story 1.8
//! must produce identical bytes.

use soroban_sdk::{panic_with_error, Address, Bytes, BytesN, Env, Vec};

use crate::error::NietSettlerError;
use crate::intent::{
    Action, BlendSupplyParams, Condition, Fallback, NietIntent, RateThresholdParams, RefundParams,
    TimeBoundParams, CURRENT_INTENT_VERSION,
};
use crate::storage;

/// Niet magic bytes at the head of hookData: ASCII "NIET".
const NIET_MAGIC: [u8; 4] = *b"NIET";

const HEADER_LEN: u32 = 12; // 4 magic + 4 version + 4 length

/// Validated CCTP burn message data extracted from `mint_and_settle`'s input.
pub struct ValidatedCctpMessage {
    pub source_domain: u32,
    pub burn_token: BytesN<32>,
    pub hook_data: Bytes,
}

/// Validate the CCTP V2 message format at the level Niet cares about:
/// message + burn message versions match expected, `mint_recipient` equals this
/// contract, and `recipient` equals the configured TokenMessengerMinter. Extract
/// `source_domain`, `burn_token`, and `hook_data`.
pub fn validate_cctp_message(env: &Env, message: &Bytes) -> ValidatedCctpMessage {
    // CCTP MessageV2 header layout (from circlefin/stellar-cctp):
    //   version(4) | source_domain(4) | destination_domain(4) | nonce(32)
    //     | sender(32) | recipient(32) | destination_caller(32)
    //     | min_finality_threshold(4) | finality_threshold_executed(4)
    //     | message_body(dynamic)
    const HEADER_TOTAL: u32 = 4 + 4 + 4 + 32 + 32 + 32 + 32 + 4 + 4;

    if message.len() < HEADER_TOTAL {
        panic_with_error!(env, NietSettlerError::InvalidMessageFormat);
    }

    let msg_version = read_u32_be(env, message, 0);
    if msg_version != storage::get_expected_msg_version(env) {
        panic_with_error!(env, NietSettlerError::UnsupportedMessageVersion);
    }

    let source_domain = read_u32_be(env, message, 4);
    let recipient = read_bytes32(env, message, 76);

    // The `recipient` field of the outer message must be the TokenMessengerMinter,
    // which handles the burn-message body and mints USDC. We enforce this here so
    // that a spoofed recipient can't sneak through.
    let tmm_addr = storage::get_token_messenger_minter(env);
    let expected_recipient = crate::util::address_to_bytes32(env, &tmm_addr);
    if recipient != expected_recipient {
        panic_with_error!(env, NietSettlerError::InvalidMintRecipient);
    }

    let message_body = message.slice(HEADER_TOTAL..message.len());

    // CCTP BurnMessageV2 layout (from circlefin/stellar-cctp):
    //   version(4) | burn_token(32) | mint_recipient(32) | amount(32)
    //     | message_sender(32) | max_fee(32) | fee_executed(32)
    //     | expiration_block(32) | hook_data(dynamic)
    const BURN_HEADER_TOTAL: u32 = 4 + 32 + 32 + 32 + 32 + 32 + 32 + 32;

    if message_body.len() < BURN_HEADER_TOTAL {
        panic_with_error!(env, NietSettlerError::InvalidBurnMessageFormat);
    }

    let burn_version = read_u32_be(env, &message_body, 0);
    if burn_version != storage::get_expected_burn_msg_version(env) {
        panic_with_error!(env, NietSettlerError::UnsupportedBurnMessageVersion);
    }

    let burn_token = read_bytes32(env, &message_body, 4);
    let mint_recipient = read_bytes32(env, &message_body, 4 + 32);

    // mint_recipient must equal us: after MessageTransmitter fires the outer
    // recipient callback (TMM), TMM mints USDC to `mint_recipient`. We only accept
    // messages that target this contract as the mint_recipient.
    let self_bytes32 = crate::util::address_to_bytes32(env, &env.current_contract_address());
    if mint_recipient != self_bytes32 {
        panic_with_error!(env, NietSettlerError::InvalidMintRecipient);
    }

    let hook_data = message_body.slice(BURN_HEADER_TOTAL..message_body.len());

    ValidatedCctpMessage { source_domain, burn_token, hook_data }
}

/// Decode a Niet-encoded hookData payload into a `NietIntent`. Rejects anything
/// that doesn't lead with the Niet magic bytes or that has an unsupported version.
///
/// Called from `mint_and_settle` via the storage-reading wrapper below. This
/// context-free version exists so tests can exercise the decoder without
/// spinning up the full contract.
pub fn decode_niet_intent_with_version(
    env: &Env,
    hook_data: &Bytes,
    expected_version: u32,
) -> NietIntent {
    if hook_data.len() < HEADER_LEN {
        panic_with_error!(env, NietSettlerError::HookDataTooShort);
    }

    // Magic bytes
    for (i, b) in NIET_MAGIC.iter().enumerate() {
        if hook_data.get(i as u32).unwrap_or(0) != *b {
            panic_with_error!(env, NietSettlerError::InvalidNietMagic);
        }
    }

    let version = read_u32_be(env, hook_data, 4);
    if version != expected_version {
        panic_with_error!(env, NietSettlerError::UnsupportedIntentVersion);
    }
    if version != CURRENT_INTENT_VERSION {
        panic_with_error!(env, NietSettlerError::UnsupportedIntentVersion);
    }

    let payload_len = read_u32_be(env, hook_data, 8);
    let end = HEADER_LEN
        .checked_add(payload_len)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::HookDataTooShort));
    if hook_data.len() < end {
        panic_with_error!(env, NietSettlerError::HookDataTooShort);
    }

    let payload = hook_data.slice(HEADER_LEN..end);
    decode_intent_payload(env, &payload, version)
}

/// Storage-aware wrapper — reads the expected intent version from contract
/// instance storage and delegates to `decode_niet_intent_with_version`.
pub fn decode_niet_intent(env: &Env, hook_data: &Bytes) -> NietIntent {
    let expected = storage::get_expected_intent_version(env);
    decode_niet_intent_with_version(env, hook_data, expected)
}

/// Decode the packed NietIntent payload (post magic + version + length header).
///
/// Layout (v1):
/// ```text
/// bytes  0..32 : intent_hash (32)
/// bytes 32..64 : user_stellar_addr as contract-ID bytes32 (32)
/// bytes 64..65 : action_tag (u8)
///   BlendSupply (0):
///     bytes 65..97 : pool (32 bytes)
///     bytes 97..101: request_type (u32 BE)
/// bytes N..N+1 : fallback_tag (u8)  — offset varies by preceding variant sizes
///   Refund (0):
///     bytes +1..+5 : source_domain (u32 BE)
///     bytes +5..+37: source_recipient (32 bytes)
///   Hold (1):
///     (no additional bytes)
/// bytes M..M+2 : condition_count (u16 BE)
/// For each condition:
///   bytes 0..1 : condition_tag (u8)
///   RateThreshold (0):
///     bytes 1..33 : pool (32 bytes)
///     bytes 33..37: min_apy_bps (u32 BE)
///   TimeBound (1):
///     bytes 1..9  : max_stellar_ledger_ts (u64 BE)
/// ```
///
/// `user_stellar_addr` is encoded as a 32-byte contract-ID. G-address delivery
/// for Hold fallback would require an extended encoding; v1 restricts Hold
/// targets to contract addresses.
fn decode_intent_payload(env: &Env, payload: &Bytes, version: u32) -> NietIntent {
    let mut cursor: u32 = 0;
    let get_u8 = |cur: u32| -> u8 {
        payload
            .get(cur)
            .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::InvalidIntentPayload))
    };
    let need = |cur: u32, n: u32| -> u32 {
        cur.checked_add(n)
            .filter(|e| *e <= payload.len())
            .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::InvalidIntentPayload))
    };

    // intent_hash
    let hash_end = need(cursor, 32);
    let intent_hash = read_bytes32(env, payload, cursor);
    cursor = hash_end;

    // user_stellar_addr (as contract-ID)
    let addr_end = need(cursor, 32);
    let user_addr_bytes = read_bytes32(env, payload, cursor);
    let user_stellar_addr = crate::util::contract_bytes32_to_address(env, &user_addr_bytes);
    cursor = addr_end;

    // action
    let action_end = need(cursor, 1);
    let action_tag = get_u8(cursor);
    cursor = action_end;
    let action = match action_tag {
        0 => {
            // BlendSupply
            let pool_end = need(cursor, 32);
            let pool_bytes = read_bytes32(env, payload, cursor);
            let pool = crate::util::contract_bytes32_to_address(env, &pool_bytes);
            cursor = pool_end;
            let req_end = need(cursor, 4);
            let request_type = read_u32_be(env, payload, cursor);
            cursor = req_end;
            Action::BlendSupply(BlendSupplyParams { pool, request_type })
        }
        _ => panic_with_error!(env, NietSettlerError::UnknownActionVariant),
    };

    // fallback
    let fb_end = need(cursor, 1);
    let fb_tag = get_u8(cursor);
    cursor = fb_end;
    let fallback = match fb_tag {
        0 => {
            let d_end = need(cursor, 4);
            let source_domain = read_u32_be(env, payload, cursor);
            cursor = d_end;
            let r_end = need(cursor, 32);
            let source_recipient = read_bytes32(env, payload, cursor);
            cursor = r_end;
            Fallback::Refund(RefundParams { source_domain, source_recipient })
        }
        1 => Fallback::Hold,
        _ => panic_with_error!(env, NietSettlerError::InvalidIntentPayload),
    };

    // conditions
    let n_end = need(cursor, 2);
    let cond_count = read_u16_be(env, payload, cursor);
    cursor = n_end;

    let mut conditions = Vec::new(env);
    for _ in 0..cond_count {
        let ct_end = need(cursor, 1);
        let cond_tag = get_u8(cursor);
        cursor = ct_end;
        match cond_tag {
            0 => {
                let p_end = need(cursor, 32);
                let pool_bytes = read_bytes32(env, payload, cursor);
                let pool = crate::util::contract_bytes32_to_address(env, &pool_bytes);
                cursor = p_end;
                let a_end = need(cursor, 4);
                let min_apy_bps = read_u32_be(env, payload, cursor);
                cursor = a_end;
                conditions.push_back(Condition::RateThreshold(RateThresholdParams {
                    pool,
                    min_apy_bps,
                }));
            }
            1 => {
                let t_end = need(cursor, 8);
                let max_ts = read_u64_be(env, payload, cursor);
                cursor = t_end;
                conditions.push_back(Condition::TimeBound(TimeBoundParams {
                    max_stellar_ledger_ts: max_ts,
                }));
            }
            _ => panic_with_error!(env, NietSettlerError::UnknownConditionVariant),
        }
    }

    let _ = cursor; // remaining bytes ignored (allows forward-compat trailers)

    NietIntent {
        version,
        intent_hash,
        user_stellar_addr,
        action,
        conditions,
        fallback,
    }
}

// ---------- byte helpers ----------

fn read_u16_be(env: &Env, bytes: &Bytes, offset: u32) -> u16 {
    let b0 = bytes
        .get(offset)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::InvalidIntentPayload));
    let b1 = bytes
        .get(offset + 1)
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::InvalidIntentPayload));
    ((b0 as u16) << 8) | (b1 as u16)
}

fn read_u32_be(env: &Env, bytes: &Bytes, offset: u32) -> u32 {
    let mut out: u32 = 0;
    for i in 0..4 {
        let b = bytes
            .get(offset + i)
            .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::InvalidMessageFormat));
        out = (out << 8) | (b as u32);
    }
    out
}

fn read_u64_be(env: &Env, bytes: &Bytes, offset: u32) -> u64 {
    let mut out: u64 = 0;
    for i in 0..8 {
        let b = bytes
            .get(offset + i)
            .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::InvalidIntentPayload));
        out = (out << 8) | (b as u64);
    }
    out
}

fn read_bytes32(env: &Env, bytes: &Bytes, offset: u32) -> BytesN<32> {
    let end = offset
        .checked_add(32)
        .filter(|e| *e <= bytes.len())
        .unwrap_or_else(|| panic_with_error!(env, NietSettlerError::InvalidMessageFormat));
    let slice = bytes.slice(offset..end);
    let mut arr = [0u8; 32];
    for i in 0..32u32 {
        arr[i as usize] = slice.get(i).unwrap_or(0);
    }
    BytesN::from_array(env, &arr)
}
