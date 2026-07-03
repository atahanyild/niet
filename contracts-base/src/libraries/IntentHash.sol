// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// Canonical intent hash — client-computed advisory identifier used for event
/// indexing and status lookups. Not cryptographically bound on the Stellar
/// side; replay safety is provided by CCTP's MessageTransmitter nonce.
library IntentHash {
    function compute(
        uint256 chainId,
        address originSettler,
        address user,
        uint256 nonce,
        bytes memory orderData
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(chainId, originSettler, user, nonce, orderData));
    }
}
