// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

import { DepositEncoder } from "./DepositEncoder.sol";

contract DepositEncoderMock {
    using DepositEncoder for bytes32;

    function encodeDeposit(address recipient, uint96 amount) public pure returns (bytes32) {
        return DepositEncoder.encodeDeposit(recipient, amount);
    }

    function getDepositRecipient(bytes32 encodedDeposit) public pure returns (address) {
        return encodedDeposit.getDepositRecipient();
    }

    function getDepositAmount(bytes32 encodedDeposit) public pure returns (uint96) {
        return encodedDeposit.getDepositAmount();
    }

    function decodeDeposit(bytes32 encodedDeposit) public pure returns (address recipient, uint96 amount) {
        return encodedDeposit.decodeDeposit();
    }
}