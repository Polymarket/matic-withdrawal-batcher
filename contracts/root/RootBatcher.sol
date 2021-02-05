// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

import "hardhat/console.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IRootChainManager } from "./interfaces/IRootChainManager.sol";
import { BaseRootTunnel } from "./BaseRootTunnel.sol";
import { DepositEncoder } from "../common/DepositEncoder.sol";

contract RootBatcher is BaseRootTunnel {
    using DepositEncoder for bytes32;

    event Deposit(address indexed depositor, address indexed recipient, uint96 amount);
    event BridgedDeposits(address indexed bridger, bytes depositMessage, uint256 amount);

    address public immutable erc20TokenPredicate;
    IRootChainManager public immutable rootChainManager;
    IERC20 public immutable depositToken;

    mapping(address => uint256) public balance;

    /**
     *
     * @param _depositToken - ERC20 token which this contract is batching deposits for
     * @param _rootChainManager - RootChainManager contract to initate deposits onto Matic
     * @param _erc20TokenPredicate - ERC20TokenPredicate contract which will take deposited funds
     */
    constructor(IERC20 _depositToken, IRootChainManager _rootChainManager, address _erc20TokenPredicate) public {
        depositToken = _depositToken;
        rootChainManager = _rootChainManager;
        erc20TokenPredicate = _erc20TokenPredicate;
    }

    /**
     * Transfers user's funds to the contract to be included in a deposit, increasing their balance
     * @param recipient - address on child chain which will be able to claim funds
     * @param amount - amount of funds to be deposited for recipient
     */
    function deposit(address recipient, uint96 amount) external {
        require(depositToken.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        
        balance[recipient] += amount;
        emit Deposit(msg.sender, recipient, amount);
    }

    /**
     * Bundles a number of user's balances into a single deposit onto Matic
     * @dev Deposits are encoded by shifting the recipient address into the upper bytes of the bytes32 object.
     *      This leaves 12 bytes to store the deposit amount in the lower bits.
     *      e.g. A deposit of 100 (0x64) to the address 0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA 
     *           results in 0xf35a15fa6dc1c11c8f242663fea308cd85688ada000000000000000000000064
     *
     *      This array is concatenated and passed to the childBatcher on Matic to redistribute funds
     * @param encodedDeposits - an array of bytes32 objects which each represent a deposit into a recipient's account on Matic
     */
    function bridgeDeposits(bytes32[] calldata encodedDeposits) external {
        uint256 totalDepositAmount;
        // Calculate amount of funds to be bridged for deposits and message
        for (uint256 i; i < encodedDeposits.length; i++){
            bytes32 encodedDeposit = encodedDeposits[i];
            (address recipient, uint96 depositAmount) = encodedDeposit.decodeDeposit();
            totalDepositAmount += depositAmount;

            // Enforce that recipient has enough funds for this deposit
            uint256 recipientBalance = balance[recipient];
            require(recipientBalance >= depositAmount, "Recipient balance too low for deposit");
            balance[recipient] = recipientBalance - depositAmount;
        }

        // Deposit the amount of funds needed for newly processed deposits
        depositToken.approve(erc20TokenPredicate, totalDepositAmount);
        rootChainManager.depositFor(address(this), address(depositToken), abi.encode(totalDepositAmount));

        // Send a message to contract on Matic to allow recipients to withdraw
        bytes memory depositMessage = abi.encode(encodedDeposits);
        _sendMessageToChild(depositMessage);

        emit BridgedDeposits(msg.sender, depositMessage, totalDepositAmount);
    }

    /**
     * @notice Process message received from Child Tunnel
     * @dev function needs to be implemented to handle message as per requirement
     * This is called by onStateReceive function.
     * Since it is called via a system call, any event will not be emitted during its execution.
     * @param message bytes message that was sent from Child Tunnel
     */
    function _processMessageFromChild(bytes memory message) override internal {
        console.logBytes(message);
    }
}
