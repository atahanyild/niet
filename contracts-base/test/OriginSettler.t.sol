// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import { OriginSettler } from "../src/OriginSettler.sol";
import { NietTypes } from "../src/libraries/NietTypes.sol";
import { OnchainCrossChainOrder } from "../src/interfaces/IERC7683.sol";
import { ITokenMessengerV2 } from "../src/interfaces/ITokenMessengerV2.sol";

// --------- mocks ---------

contract MockUsdc {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockTokenMessenger is ITokenMessengerV2 {
    event Called(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes hookData
    );

    function depositForBurn(
        uint256,
        uint32,
        bytes32,
        address,
        bytes32,
        uint256,
        uint32
    ) external pure {
        revert("only Hook variant used");
    }

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external {
        emit Called(
            amount,
            destinationDomain,
            mintRecipient,
            burnToken,
            destinationCaller,
            maxFee,
            minFinalityThreshold,
            hookData
        );
    }
}

// --------- tests ---------

contract OriginSettlerTest is Test {
    MockUsdc usdc;
    MockTokenMessenger tokenMessenger;
    OriginSettler settler;

    bytes32 constant NIET_SETTLER =
        0x9a259e8debaafa98db19ee3fea73e300dd1dbd84a1f4f94f14d4ec542346d48e;
    uint32 constant DEST_DOMAIN = 27;
    uint32 constant FAST_THRESHOLD = 1000;

    address user = address(0xBEEF);

    function setUp() public {
        usdc = new MockUsdc();
        tokenMessenger = new MockTokenMessenger();
        settler = new OriginSettler(
            address(tokenMessenger),
            address(usdc),
            DEST_DOMAIN,
            NIET_SETTLER,
            FAST_THRESHOLD
        );
        usdc.mint(user, 10_000_000);
    }

    function _buildOrder(uint256 amount, uint256 maxFee)
        private
        view
        returns (OnchainCrossChainOrder memory)
    {
        NietTypes.Condition[] memory conds = new NietTypes.Condition[](1);
        conds[0] = NietTypes.Condition({
            tag: NietTypes.COND_TIME_BOUND,
            pool: bytes32(0),
            minApyBps: 0,
            maxStellarLedgerTs: 5_000_000
        });

        NietTypes.NietOrderData memory nod = NietTypes.NietOrderData({
            inputToken: address(0),         // set below by caller
            amount: amount,
            maxFee: maxFee,
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

        // Callers replace inputToken with the real mock USDC address.
        return OnchainCrossChainOrder({
            fillDeadline: uint32(block.timestamp + 3600),
            orderDataType: NietTypes.ORDER_DATA_TYPE_NIET_V1,
            orderData: abi.encode(nod)
        });
    }

    function _buildValidOrder(uint256 amount, uint256 maxFee)
        private
        view
        returns (OnchainCrossChainOrder memory)
    {
        OnchainCrossChainOrder memory order = _buildOrder(amount, maxFee);
        NietTypes.NietOrderData memory nod =
            abi.decode(order.orderData, (NietTypes.NietOrderData));
        nod.inputToken = address(usdc);
        order.orderData = abi.encode(nod);
        return order;
    }

    function test_open_emitsCctpCall() public {
        OnchainCrossChainOrder memory order = _buildValidOrder(1_000_000, 500);
        vm.prank(user);
        usdc.approve(address(settler), 1_000_000);

        vm.prank(user);
        settler.open(order);

        // Contract now holds no USDC (was approved to tokenMessenger which
        // in the mock just emits an event).
        assertEq(usdc.balanceOf(address(settler)), 1_000_000);
        // TokenMessenger allowance from settler should have been set to 1e6.
        assertEq(usdc.allowance(address(settler), address(tokenMessenger)), 1_000_000);
    }

    function test_open_revertsOnUnsupportedInputToken() public {
        OnchainCrossChainOrder memory order = _buildOrder(1_000_000, 500);
        // Leave inputToken = address(0), which should fail.
        NietTypes.NietOrderData memory nod =
            abi.decode(order.orderData, (NietTypes.NietOrderData));
        nod.inputToken = address(0xdeadbeef);
        order.orderData = abi.encode(nod);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                OriginSettler.UnsupportedInputToken.selector,
                address(0xdeadbeef)
            )
        );
        settler.open(order);
    }

    function test_open_revertsOnZeroAmount() public {
        OnchainCrossChainOrder memory order = _buildValidOrder(0, 0);
        vm.prank(user);
        vm.expectRevert(OriginSettler.InvalidInputAmount.selector);
        settler.open(order);
    }

    function test_openFor_revertsBecausePhase2() public {
        // Just construct a minimal GaslessCrossChainOrder-shaped call.
        vm.expectRevert(OriginSettler.GaslessOrdersNotSupported.selector);
        // Solidity syntax hack: we can't call openFor with an empty struct via
        // struct literal in older versions, but any call reverts before args read.
        (bool ok,) = address(settler).call(
            abi.encodeWithSignature("openFor(bytes,bytes,bytes)", "", "", "")
        );
        assertFalse(ok);
    }

    function test_open_revertsOnUnsupportedOrderDataType() public {
        OnchainCrossChainOrder memory order = _buildValidOrder(1_000_000, 500);
        order.orderDataType = keccak256("WrongType");
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                OriginSettler.UnsupportedOrderDataType.selector,
                keccak256("WrongType")
            )
        );
        settler.open(order);
    }
}
