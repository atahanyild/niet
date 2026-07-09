// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import { HookDataCodec } from "../../src/libraries/HookDataCodec.sol";
import { NietTypes } from "../../src/libraries/NietTypes.sol";

contract HookDataCodecTest is Test {
    function _basicHoldTimebound() private pure returns (NietTypes.NietOrderData memory) {
        NietTypes.Condition[] memory conds = new NietTypes.Condition[](1);
        conds[0] = NietTypes.Condition({
            tag: NietTypes.COND_TIME_BOUND,
            pool: bytes32(0),
            minApyBps: 0,
            maxStellarLedgerTs: 5_000_000
        });

        return NietTypes.NietOrderData({
            inputToken: address(0xdead), // ignored by encoder
            amount: 1_000_000,
            maxFee: 500,
            userStellarAddr: 0xa1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0,
            nonce: 1,
            action: NietTypes.Action({
                tag: NietTypes.ACTION_BLEND_SUPPLY,
                pool: 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20,
                requestType: 2
            }),
            fbk: NietTypes.Fallback({
                tag: NietTypes.FALLBACK_HOLD,
                sourceDomain: 0,
                sourceRecipient: bytes32(0)
            }),
            conditions: conds
        });
    }

    function test_encode_headerFormat() public pure {
        NietTypes.NietOrderData memory nod = _basicHoldTimebound();
        bytes memory hd = HookDataCodec.encode(bytes32(0), nod);

        // Header
        assertEq(hd[0], bytes1("N"));
        assertEq(hd[1], bytes1("I"));
        assertEq(hd[2], bytes1("E"));
        assertEq(hd[3], bytes1("T"));
        // Version big-endian
        assertEq(uint8(hd[7]), 1);
        // Length at bytes 8..12 should equal payload length = hd.length - 12
        assertEq(uint32(bytesToUint32(hd, 8)), uint32(hd.length - 12));
    }

    function test_encode_goldenVector_basicHoldTimebound() public pure {
        NietTypes.NietOrderData memory nod = _basicHoldTimebound();
        bytes memory got = HookDataCodec.encode(bytes32(0), nod);

        // Layout:
        //   0..4 magic
        //   4..8 version=1 BE
        //   8..12 length BE
        //   12..44 intent_hash (32 zeros)
        //   44..76 user_stellar_addr
        //   76..77 action_tag = 0
        //   77..109 pool
        //   109..113 request_type = 2 BE
        //   113..114 fallback_tag = 1 (Hold, no extra)
        //   114..116 cond_count = 1 BE
        //   116..117 cond_tag = 1 (TimeBound)
        //   117..125 max_stellar_ledger_ts = 5_000_000 BE

        // Payload length = 125 - 12 = 113
        assertEq(uint32(bytesToUint32(got, 8)), 113);

        // action_tag @ 76
        assertEq(uint8(got[76]), 0);
        // request_type @ 109..113 = 2
        assertEq(uint32(bytesToUint32(got, 109)), 2);
        // fallback_tag @ 113 = 1
        assertEq(uint8(got[113]), 1);
        // condition_count @ 114..116 = 1
        assertEq(uint16(bytesToUint16(got, 114)), 1);
        // condition tag @ 116 = 1 (TimeBound)
        assertEq(uint8(got[116]), 1);
        // max ts @ 117..125 = 5_000_000
        assertEq(uint64(bytesToUint64(got, 117)), 5_000_000);
    }

    function test_encode_refundFallback_hasSourceDomainAndRecipient() public pure {
        NietTypes.NietOrderData memory nod = _basicHoldTimebound();
        nod.fbk = NietTypes.Fallback({
            tag: NietTypes.FALLBACK_REFUND,
            sourceDomain: 6,
            sourceRecipient: 0x0202020202020202020202020202020202020202020202020202020202020202
        });
        bytes memory hd = HookDataCodec.encode(bytes32(0), nod);
        // fallback_tag @ 113 = 0 (Refund)
        assertEq(uint8(hd[113]), 0);
        // source_domain @ 114..118 = 6
        assertEq(uint32(bytesToUint32(hd, 114)), 6);
        // source_recipient @ 118..150
        assertEq(uint8(hd[118]), 2);
        assertEq(uint8(hd[149]), 2);
        // condition_count @ 150..152
        assertEq(uint16(bytesToUint16(hd, 150)), 1);
    }

    function test_encode_rateThresholdCondition() public pure {
        NietTypes.NietOrderData memory nod = _basicHoldTimebound();
        nod.conditions = new NietTypes.Condition[](1);
        nod.conditions[0] = NietTypes.Condition({
            tag: NietTypes.COND_RATE_THRESHOLD,
            pool: 0x0303030303030303030303030303030303030303030303030303030303030303,
            minApyBps: 420,
            maxStellarLedgerTs: 0
        });
        bytes memory hd = HookDataCodec.encode(bytes32(0), nod);
        // cond_tag @ 116
        assertEq(uint8(hd[116]), 0);
        // pool @ 117..149 = 0x03 * 32
        assertEq(uint8(hd[117]), 3);
        assertEq(uint8(hd[148]), 3);
        // min_apy_bps @ 149..153 = 420
        assertEq(uint32(bytesToUint32(hd, 149)), 420);
    }

    // ---------- byte helpers ----------

    function bytesToUint16(bytes memory b, uint256 offset) internal pure returns (uint16) {
        return uint16(uint8(b[offset])) << 8 | uint16(uint8(b[offset + 1]));
    }

    function bytesToUint32(bytes memory b, uint256 offset) internal pure returns (uint32) {
        uint32 v;
        for (uint256 i = 0; i < 4; ++i) {
            v = (v << 8) | uint32(uint8(b[offset + i]));
        }
        return v;
    }

    function bytesToUint64(bytes memory b, uint256 offset) internal pure returns (uint64) {
        uint64 v;
        for (uint256 i = 0; i < 8; ++i) {
            v = (v << 8) | uint64(uint8(b[offset + i]));
        }
        return v;
    }
}
