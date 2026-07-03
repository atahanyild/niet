//! Unit tests for NietSettler. Focus: type system + hookData decoder correctness.
//! End-to-end mint_and_settle behavior tests need mocked MessageTransmitter +
//! TokenMessengerMinter contracts — arriving in Story 1.7 test harness.

#![cfg(test)]

extern crate alloc;

use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, Vec};

use crate::error::NietSettlerError;
use crate::intent::{
    Action, BlendSupplyParams, Condition, Fallback, NietIntent, RefundParams, TimeBoundParams,
    CURRENT_INTENT_VERSION,
};
use crate::message;

// ---------- helpers ----------

/// Build a valid hookData payload with a `TimeBound` condition, `BlendSupply`
/// action, and `Hold` fallback. Used as the baseline "known good" vector.
fn build_hookdata_basic(env: &Env, pool_bytes: [u8; 32], user_bytes: [u8; 32]) -> Bytes {
    let mut buf: alloc::vec::Vec<u8> = alloc::vec::Vec::new();

    // Header
    buf.extend_from_slice(b"NIET");
    buf.extend_from_slice(&1u32.to_be_bytes()); // version

    // Compute payload
    let mut payload: alloc::vec::Vec<u8> = alloc::vec::Vec::new();

    // intent_hash (32 zeros for simplicity)
    payload.extend_from_slice(&[0u8; 32]);
    // user_stellar_addr (contract-ID bytes)
    payload.extend_from_slice(&user_bytes);
    // action_tag: 0 = BlendSupply
    payload.push(0);
    // BlendSupply pool
    payload.extend_from_slice(&pool_bytes);
    // BlendSupply request_type = 2
    payload.extend_from_slice(&2u32.to_be_bytes());
    // fallback_tag: 1 = Hold
    payload.push(1);
    // condition_count = 1
    payload.extend_from_slice(&1u16.to_be_bytes());
    // condition_tag: 1 = TimeBound
    payload.push(1);
    // max_stellar_ledger_ts
    payload.extend_from_slice(&5_000_000u64.to_be_bytes());

    buf.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    buf.extend_from_slice(&payload);

    Bytes::from_slice(env, &buf)
}

fn contract_bytes(env: &Env) -> ([u8; 32], [u8; 32]) {
    // Deterministic non-zero bytes so we get real "contract" IDs.
    let pool = [
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e,
        0x1f, 0x20,
    ];
    let user = [
        0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xad, 0xae, 0xaf,
        0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xbb, 0xbc, 0xbd, 0xbe,
        0xbf, 0xc0,
    ];
    let _ = env;
    (pool, user)
}

// ---------- type system smoke test ----------

#[test]
fn intent_type_smoke() {
    let env = Env::default();
    let hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
    let user = Address::generate(&env);
    let pool = Address::generate(&env);
    let recipient: BytesN<32> = BytesN::from_array(&env, &[7u8; 32]);

    let mut conditions = Vec::new(&env);
    conditions.push_back(Condition::TimeBound(TimeBoundParams {
        max_stellar_ledger_ts: 1_000_000,
    }));

    let intent = NietIntent {
        version: CURRENT_INTENT_VERSION,
        intent_hash: hash.clone(),
        user_stellar_addr: user.clone(),
        action: Action::BlendSupply(BlendSupplyParams {
            pool: pool.clone(),
            request_type: 2,
        }),
        conditions,
        fallback: Fallback::Refund(RefundParams {
            source_domain: 6,
            source_recipient: recipient.clone(),
        }),
    };

    assert_eq!(intent.version, CURRENT_INTENT_VERSION);
    assert_eq!(intent.intent_hash, hash);
    assert_eq!(intent.conditions.len(), 1);
    assert!(matches!(intent.action, Action::BlendSupply(_)));
    assert!(matches!(intent.fallback, Fallback::Refund(_)));
}

// ---------- hookData decoding ----------

/// Register a bare contract shell so we can call `env.as_contract` and give
/// the decoder a Soroban context. We use a placeholder empty stub — the tests
/// never invoke it, they just need any contract ID.
mod shell {
    use soroban_sdk::{contract, contractimpl};

    #[contract]
    pub struct Shell;

    #[contractimpl]
    impl Shell {
        pub fn __constructor(_env: soroban_sdk::Env) {}
    }
}

fn init_settler_for_decode_test(env: &Env) -> Address {
    env.register(shell::Shell, ())
}

#[test]
fn hookdata_decode_basic() {
    let env = Env::default();
    let contract_id = init_settler_for_decode_test(&env);
    let (pool_bytes, user_bytes) = contract_bytes(&env);
    let hook = build_hookdata_basic(&env, pool_bytes, user_bytes);

    let intent = env.as_contract(&contract_id, || {
        message::decode_niet_intent_with_version(&env, &hook, CURRENT_INTENT_VERSION)
    });

    assert_eq!(intent.version, CURRENT_INTENT_VERSION);
    assert_eq!(intent.conditions.len(), 1);
    match intent.action {
        Action::BlendSupply(params) => assert_eq!(params.request_type, 2),
    }
    assert!(matches!(intent.fallback, Fallback::Hold));
    match intent.conditions.get(0).unwrap() {
        Condition::TimeBound(p) => assert_eq!(p.max_stellar_ledger_ts, 5_000_000),
        _ => panic!("wrong condition variant"),
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #1301)")]
fn hookdata_decode_wrong_magic() {
    let env = Env::default();
    let contract_id = init_settler_for_decode_test(&env);
    let (pool_bytes, user_bytes) = contract_bytes(&env);
    let mut bytes = build_hookdata_basic(&env, pool_bytes, user_bytes).to_alloc_vec();
    // Break the magic byte.
    bytes[0] = b'X';
    let bad = Bytes::from_slice(&env, &bytes);
    env.as_contract(&contract_id, || {
        let _ = message::decode_niet_intent_with_version(&env, &bad, CURRENT_INTENT_VERSION);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #1302)")]
fn hookdata_decode_wrong_version() {
    let env = Env::default();
    let contract_id = init_settler_for_decode_test(&env);
    let (pool_bytes, user_bytes) = contract_bytes(&env);
    let mut bytes = build_hookdata_basic(&env, pool_bytes, user_bytes).to_alloc_vec();
    // Bump version to something we don't support.
    bytes[4] = 0;
    bytes[5] = 0;
    bytes[6] = 0;
    bytes[7] = 99;
    let bad = Bytes::from_slice(&env, &bytes);
    env.as_contract(&contract_id, || {
        let _ = message::decode_niet_intent_with_version(&env, &bad, CURRENT_INTENT_VERSION);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #1300)")]
fn hookdata_decode_too_short() {
    let env = Env::default();
    let contract_id = init_settler_for_decode_test(&env);
    let bad = Bytes::from_slice(&env, &[b'N', b'I', b'E', b'T', 0, 0, 0, 1]);
    env.as_contract(&contract_id, || {
        let _ = message::decode_niet_intent_with_version(&env, &bad, CURRENT_INTENT_VERSION);
    });
}

// ---------- Bytes helper ----------

// `Bytes::to_alloc_vec` is not a soroban_sdk API; provide a local shim so the
// tests above stay concise.
trait BytesAllocVec {
    fn to_alloc_vec(&self) -> alloc::vec::Vec<u8>;
}
impl BytesAllocVec for Bytes {
    fn to_alloc_vec(&self) -> alloc::vec::Vec<u8> {
        let mut out = alloc::vec::Vec::with_capacity(self.len() as usize);
        for i in 0..self.len() {
            out.push(self.get(i).unwrap_or(0));
        }
        out
    }
}
