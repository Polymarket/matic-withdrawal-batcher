// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

import { IChildERC20 } from "./interfaces/IChildERC20.sol";
import { BaseChildTunnel } from "./BaseChildTunnel.sol";
import { DepositEncoder } from "../common/DepositEncoder.sol";

contract ChildWithdrawalBatcher is BaseChildTunnel {
    using DepositEncoder for bytes32;

    event Deposit(address indexed depositor, address indexed recipient, uint256 amount);
    event Withdrawal(address indexed recipient, uint256 amount);
    event BridgedWithdrawals(address indexed bridger, bytes withdrawalMessage, uint256 amount);

    IChildERC20 public immutable withdrawalToken;

    mapping(address => uint256) public balance;

    /**
     *
     * @param _withdrawalToken - ERC20 token which this contract is batching withdrawals for
     */
    constructor(IChildERC20 _withdrawalToken) public {
        withdrawalToken = _withdrawalToken;
    }

    /**
     * Transfers user's funds to the contract to be included in a withdrawal to another account, increasing its balance
     * @param recipient - address on root chain which will be able to claim funds
     * @param amount - amount of funds to be deposited for recipient
     */
    function depositFor(address recipient, uint96 amount) public {
        require(withdrawalToken.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        
        balance[recipient] += amount;
        emit Deposit(msg.sender, recipient, amount);
    }

    /**
     * Withdraws from user's internal balance back to their account on Matic
     * @param amount - amount of funds to be withdrawn for recipient
     */
    function withdraw(uint256 amount) external {
        uint256 userBalance = balance[msg.sender];
        require(userBalance >= amount, "Insufficient balance for withdrawal");
        balance[msg.sender] =  userBalance - amount;
        
        require(withdrawalToken.transfer(msg.sender, amount), "Token transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    /**
     * Bundles a number of user's balances into a single withdrawal from Matic
     * @dev Withdrawals are encoded by shifting the recipient address into the upper bytes of the bytes32 object.
     *      This leaves 12 bytes to store the withdrawal amount in the lower bits.
     *      e.g. A deposit of 100 (0x64) to the address 0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA 
     *           results in 0xf35a15fa6dc1c11c8f242663fea308cd85688ada000000000000000000000064
     *
     *      This array is concatenated and passed to the RootWithdrawalBatcher on Ethereum to redistribute funds
     * @param encodedWithdrawals - an array of bytes32 objects which each represent a withdrawal to a recipient's account on Ethereum
     */
    function bridgeWithdrawals(bytes32[] calldata encodedWithdrawals) external {
        uint256 totalWithdrawalAmount;
        // Calculate amount of funds to be bridged for withdrawals
        for (uint256 i; i < encodedWithdrawals.length; i++){
            (address recipient, uint96 withdrawalAmount) = encodedWithdrawals[i].decodeDeposit();
            totalWithdrawalAmount += withdrawalAmount;

            // Enforce that full balance of recipient is used
            // This prevents attacks by malicious bridgers fragmenting users' funds over many withdrawals
            require(balance[recipient] == withdrawalAmount, "Must withdraw all of user's balance");
            balance[recipient] = 0;
        }

        // Withdraw the amount of funds needed for newly processed withdrawals
        withdrawalToken.withdraw(totalWithdrawalAmount);

        // Send a message to contract on Ethereum to allow recipients to withdraw
        bytes memory withdrawalMessage = abi.encodePacked(encodedWithdrawals);
        _sendMessageToRoot(withdrawalMessage);

        emit BridgedWithdrawals(msg.sender, withdrawalMessage, totalWithdrawalAmount);
    }

    /**
     * Function is unneeded as we receive no messages from root chain
     */
    function _processMessageFromRoot(bytes memory message) internal override {}
}