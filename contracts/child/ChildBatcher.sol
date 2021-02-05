// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

import "hardhat/console.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BaseChildTunnel } from "./BaseChildTunnel.sol";
import { DepositEncoder } from "../common/DepositEncoder.sol";

contract ChildBatcher is BaseChildTunnel {
    using DepositEncoder for bytes32;

    event Claim(address indexed recipient, uint256 amount);

    IERC20 public immutable depositToken;

    mapping(address=>uint256) public balance;

    constructor(IERC20 _depositToken) public {
        depositToken = _depositToken;
    }

    function claim() external {
        uint256 amount = balance[msg.sender];
        balance[msg.sender] = 0;
        require(depositToken.transfer(msg.sender, amount), "Token transfer failed");
        emit Claim(msg.sender, amount);
    }

    /**
     * @notice Process message received from Root Tunnel
     * @dev function needs to be implemented to handle message as per requirement
     * This is called by onStateReceive function.
     * Since it is called via a system call, any event will not be emitted during its execution.
     * @param message bytes message that was sent from Root Tunnel
     */
    function _processMessageFromRoot(bytes memory message) override internal {
        for (uint256 i = 32; i <= message.length; i = i + 32){
            // Each 32 bytes of the message corresponds to an encoded deposit
            bytes32 encodedDeposit;
            assembly {
                encodedDeposit := mload(add(message, i))
            }

            // Decode and add to user's balance
            (address recipient, uint96 amount) = encodedDeposit.decodeDeposit();
            balance[recipient] += amount;
        }
    }
}
