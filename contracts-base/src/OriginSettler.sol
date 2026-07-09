// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {
    GaslessCrossChainOrder,
    OnchainCrossChainOrder,
    ResolvedCrossChainOrder,
    Output,
    FillInstruction,
    IOriginSettler
} from "./interfaces/IERC7683.sol";
import { ITokenMessengerV2 } from "./interfaces/ITokenMessengerV2.sol";
import { NietTypes } from "./libraries/NietTypes.sol";
import { HookDataCodec } from "./libraries/HookDataCodec.sol";
import { IntentHash } from "./libraries/IntentHash.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// Niet's origin-side ERC-7683 IOriginSettler on Base. Wraps
/// TokenMessengerV2.depositForBurnWithHook and packs the user's NietIntent into
/// hookData in the format the Stellar-side NietSettler decodes.
contract OriginSettler is IOriginSettler {
    error UnsupportedOrderDataType(bytes32 got);
    error UnsupportedInputToken(address token);
    error NonceReused(uint256 nonce);
    error GaslessOrdersNotSupported();
    error InvalidInputAmount();

    /// CCTP V2 TokenMessenger on this chain (Base Sepolia mainnet address).
    ITokenMessengerV2 public immutable tokenMessenger;
    /// USDC on this chain — the only supported input token in v1.
    address public immutable usdc;
    /// CCTP domain of the destination network Niet lives on (Stellar = 27).
    uint32 public immutable destinationDomain;
    /// Stellar-side NietSettler contract ID, as bytes32. Used as both
    /// `mintRecipient` and `destinationCaller` on the CCTP burn.
    bytes32 public immutable nietSettler;
    /// Fast Transfer finality threshold (Circle sets this to 1000 in mid-2026).
    uint32 public immutable fastFinalityThreshold;

    /// Per-user nonce → used flag (replay protection).
    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    constructor(
        address _tokenMessenger,
        address _usdc,
        uint32 _destinationDomain,
        bytes32 _nietSettler,
        uint32 _fastFinalityThreshold
    ) {
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        usdc = _usdc;
        destinationDomain = _destinationDomain;
        nietSettler = _nietSettler;
        fastFinalityThreshold = _fastFinalityThreshold;
    }

    // ---------- IOriginSettler ----------

    /// User calls this directly; no filler / signature layer in v1.
    function open(OnchainCrossChainOrder calldata order) external payable {
        if (order.orderDataType != NietTypes.ORDER_DATA_TYPE_NIET_V1) {
            revert UnsupportedOrderDataType(order.orderDataType);
        }
        NietTypes.NietOrderData memory nod = abi.decode(order.orderData, (NietTypes.NietOrderData));
        _openInternal(msg.sender, order.fillDeadline, order.orderData, nod, nod.nonce);
    }

    /// Gasless orders (openFor / EIP-712 signed) are Phase 2. Reverts in v1.
    function openFor(
        GaslessCrossChainOrder calldata /* order */,
        bytes calldata /* signature */,
        bytes calldata /* originFillerData */
    ) external pure {
        revert GaslessOrdersNotSupported();
    }

    function resolve(OnchainCrossChainOrder calldata order)
        external
        view
        returns (ResolvedCrossChainOrder memory)
    {
        NietTypes.NietOrderData memory nod = abi.decode(order.orderData, (NietTypes.NietOrderData));
        bytes32 intentHash =
            IntentHash.compute(block.chainid, address(this), msg.sender, nod.nonce, order.orderData);
        return _resolveInternal(msg.sender, order.fillDeadline, order.orderData, nod, intentHash);
    }

    function resolveFor(GaslessCrossChainOrder calldata, bytes calldata)
        external
        pure
        returns (ResolvedCrossChainOrder memory)
    {
        revert GaslessOrdersNotSupported();
    }

    // ---------- internal ----------

    function _openInternal(
        address user,
        uint32 fillDeadline,
        bytes memory orderData,
        NietTypes.NietOrderData memory nod,
        uint256 nonce
    ) private {
        if (nod.inputToken != usdc) revert UnsupportedInputToken(nod.inputToken);
        if (nod.amount == 0) revert InvalidInputAmount();
        if (nonceUsed[user][nonce]) revert NonceReused(nonce);
        nonceUsed[user][nonce] = true;

        bytes32 intentHash = IntentHash.compute(block.chainid, address(this), user, nonce, orderData);

        // Pull USDC in from the user and approve TokenMessenger to burn.
        require(IERC20(usdc).transferFrom(user, address(this), nod.amount), "USDC transferFrom failed");
        require(IERC20(usdc).approve(address(tokenMessenger), nod.amount), "USDC approve failed");

        bytes memory hookData = HookDataCodec.encode(intentHash, nod);

        tokenMessenger.depositForBurnWithHook(
            nod.amount,
            destinationDomain,
            nietSettler,          // mintRecipient
            usdc,
            nietSettler,          // destinationCaller
            nod.maxFee,
            fastFinalityThreshold,
            hookData
        );

        ResolvedCrossChainOrder memory resolved = _resolveInternal(user, fillDeadline, orderData, nod, intentHash);
        emit Open(intentHash, resolved);
    }

    function _resolveInternal(
        address user,
        uint32 fillDeadline,
        bytes memory /* orderData */,
        NietTypes.NietOrderData memory nod,
        bytes32 intentHash
    ) private view returns (ResolvedCrossChainOrder memory) {
        Output[] memory maxSpent = new Output[](1);
        maxSpent[0] = Output({
            token: bytes32(uint256(uint160(usdc))),
            amount: nod.amount,
            recipient: bytes32(uint256(uint160(user))),
            chainId: block.chainid
        });

        Output[] memory minReceived = new Output[](1);
        minReceived[0] = Output({
            token: bytes32(0), // Stellar-side USDC SAC — not addressable as EVM bytes32
            amount: nod.amount - nod.maxFee,
            recipient: nietSettler,
            chainId: uint256(destinationDomain)
        });

        FillInstruction[] memory instructions = new FillInstruction[](1);
        instructions[0] = FillInstruction({
            destinationChainId: uint256(destinationDomain),
            destinationSettler: nietSettler,
            originData: HookDataCodec.encode(intentHash, nod)
        });

        return ResolvedCrossChainOrder({
            user: user,
            originChainId: block.chainid,
            openDeadline: 0,
            fillDeadline: fillDeadline,
            orderId: intentHash,
            maxSpent: maxSpent,
            minReceived: minReceived,
            fillInstructions: instructions
        });
    }
}
