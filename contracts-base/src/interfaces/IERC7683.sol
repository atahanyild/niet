// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// Re-exports of the ERC-7683 types + interfaces from BootNodeDev/intents-framework
// so downstream Niet contracts can import from a stable local path.

import {
    GaslessCrossChainOrder,
    OnchainCrossChainOrder,
    ResolvedCrossChainOrder,
    Output,
    FillInstruction,
    IOriginSettler,
    IDestinationSettler
} from "@intents-framework/solidity/src/ERC7683/IERC7683.sol";
