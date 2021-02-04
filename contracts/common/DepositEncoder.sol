// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

library DepositEncoder {
    uint96 private constant AMOUNT_MASK = type(uint96).max;

    /**
     * Encodes a deposit such that fits into a single bytes32 variable.
     * @dev This allows the deposit to be easily sent through Matic's Data Tunnel and decoded on the other side
     * @param recipient - The address which can claim this deposit on Matic
     * @param amount - The amount of the token which claimable by the recipient
     */
    function encodeDeposit(address recipient, uint96 amount) internal pure returns (bytes32) {
        return bytes32(uint256(recipient) << 96 | uint256(amount));
    }

    /**
     * Extracts the amount of tokens to be bridged for a given deposit
     */
    function getDepositRecipient(bytes32 encodedDeposit) internal pure returns (address) {
        return address(uint160(uint256(encodedDeposit) >> 96));
    }

    /**
     * Extracts the amount of tokens to be bridged for a given deposit
     */
    function getDepositAmount(bytes32 encodedDeposit) internal pure returns (uint96) {
        return uint96(uint256(encodedDeposit) & AMOUNT_MASK);
    }

    /**
     * Extracts the amount of tokens to be bridged for a given deposit
     */
    function decodeDeposit(bytes32 encodedDeposit) internal pure returns (address recipient, uint96 amount) {
        // Shift bytes representing recipient address down into lower positions
        recipient = address(uint160(uint256(encodedDeposit) >> 96));
        amount = uint96(uint256(encodedDeposit) & AMOUNT_MASK);
    }
}
