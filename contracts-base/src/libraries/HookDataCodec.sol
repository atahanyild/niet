// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { NietTypes } from "./NietTypes.sol";

/// Encodes a NietOrderData into the packed hookData bytes Rust decodes on Stellar.
///
/// Wire format (mirrors `contracts-soroban/contracts/niet-settler/src/message.rs`):
///
/// ```text
/// bytes  0..4   : magic "NIET"
/// bytes  4..8   : schema version (u32 big-endian)
/// bytes  8..12  : payload length N (u32 big-endian)
/// bytes 12..12+N: payload
///
/// Payload (v1):
///   bytes  0..32 : intent_hash (32)
///   bytes 32..64 : user_stellar_addr (32)
///   bytes 64..65 : action_tag (u8)
///     BlendSupply (0):
///       bytes 65..97  : pool (32)
///       bytes 97..101 : request_type (u32 BE)
///   bytes ..+1  : fallback_tag (u8)
///     Refund (0):
///       bytes +1..+5   : source_domain (u32 BE)
///       bytes +5..+37  : source_recipient (32)
///     Hold (1):
///       (none)
///   bytes ..+2  : condition_count (u16 BE)
///   For each condition:
///     bytes ..+1: cond_tag (u8)
///     RateThreshold (0):
///       bytes +1..+33: pool (32)
///       bytes +33..+37: min_apy_bps (u32 BE)
///     TimeBound (1):
///       bytes +1..+9 : max_stellar_ledger_ts (u64 BE)
/// ```
library HookDataCodec {
    error UnknownActionTag(uint8 tag);
    error UnknownFallbackTag(uint8 tag);
    error UnknownConditionTag(uint8 tag);

    /// Encode a NietOrderData into hookData bytes with the given intent hash.
    function encode(
        bytes32 intentHash,
        NietTypes.NietOrderData memory order
    ) internal pure returns (bytes memory) {
        bytes memory payload = _encodePayload(intentHash, order);
        return abi.encodePacked(
            bytes4("NIET"),
            _u32be(NietTypes.INTENT_VERSION),
            _u32be(uint32(payload.length)),
            payload
        );
    }

    /// Encode just the payload portion (used by tests + intent-hash consumers).
    function encodePayload(
        bytes32 intentHash,
        NietTypes.NietOrderData memory order
    ) internal pure returns (bytes memory) {
        return _encodePayload(intentHash, order);
    }

    // ---------- internals ----------

    function _encodePayload(
        bytes32 intentHash,
        NietTypes.NietOrderData memory order
    ) private pure returns (bytes memory) {
        bytes memory actionBytes = _encodeAction(order.action);
        bytes memory fallbackBytes = _encodeFallback(order.fbk);
        bytes memory conditionsBytes = _encodeConditions(order.conditions);
        return abi.encodePacked(
            intentHash,
            order.userStellarAddr,
            actionBytes,
            fallbackBytes,
            conditionsBytes
        );
    }

    function _encodeAction(NietTypes.Action memory a) private pure returns (bytes memory) {
        if (a.tag == NietTypes.ACTION_BLEND_SUPPLY) {
            return abi.encodePacked(a.tag, a.pool, _u32be(a.requestType));
        }
        revert UnknownActionTag(a.tag);
    }

    function _encodeFallback(NietTypes.Fallback memory f) private pure returns (bytes memory) {
        if (f.tag == NietTypes.FALLBACK_REFUND) {
            return abi.encodePacked(f.tag, _u32be(f.sourceDomain), f.sourceRecipient);
        } else if (f.tag == NietTypes.FALLBACK_HOLD) {
            return abi.encodePacked(f.tag);
        }
        revert UnknownFallbackTag(f.tag);
    }

    function _encodeConditions(
        NietTypes.Condition[] memory conds
    ) private pure returns (bytes memory) {
        require(conds.length <= type(uint16).max, "too many conditions");
        bytes memory out = abi.encodePacked(_u16be(uint16(conds.length)));
        for (uint256 i = 0; i < conds.length; ++i) {
            out = abi.encodePacked(out, _encodeCondition(conds[i]));
        }
        return out;
    }

    function _encodeCondition(NietTypes.Condition memory c) private pure returns (bytes memory) {
        if (c.tag == NietTypes.COND_RATE_THRESHOLD) {
            return abi.encodePacked(c.tag, c.pool, _u32be(c.minApyBps));
        } else if (c.tag == NietTypes.COND_TIME_BOUND) {
            return abi.encodePacked(c.tag, _u64be(c.maxStellarLedgerTs));
        }
        revert UnknownConditionTag(c.tag);
    }

    function _u16be(uint16 v) private pure returns (bytes memory) {
        return abi.encodePacked(v);
    }

    function _u32be(uint32 v) private pure returns (bytes memory) {
        return abi.encodePacked(v);
    }

    function _u64be(uint64 v) private pure returns (bytes memory) {
        return abi.encodePacked(v);
    }
}
