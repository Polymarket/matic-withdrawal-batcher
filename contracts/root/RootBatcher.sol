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

    bytes32[] public deposits;
    uint256 public nextDepositId;

    constructor(IERC20 _depositToken, IRootChainManager _rootChainManager, address _erc20TokenPredicate) public {
        depositToken = _depositToken;
        rootChainManager = _rootChainManager;
        erc20TokenPredicate = _erc20TokenPredicate;
    }

    /**
     * Transfers user's funds to the contract to be included in a deposit
     * @param recipient - address on child chain which will be able to claim funds
     * @param amount - amount of funds to be deposited for recipient
     */
    function deposit(address recipient, uint96 amount) external {
        require(depositToken.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        
        deposits.push(DepositEncoder.encodeDeposit(recipient, amount));
        nextDepositId += 1;
        emit Deposit(msg.sender, recipient, amount);
    }

    function bridgeDeposits(uint256[] calldata depositIds) external {
        bytes memory depositMessage;
        uint256 depositAmount;
        
        // Calculate amount of funds to be bridged for deposits and message
        for (uint256 i; i < depositIds.length; i++){
            bytes32 encodedDeposit = deposits[depositIds[i]];
            depositAmount += encodedDeposit.getDepositAmount();
            depositMessage = abi.encodePacked(depositMessage, encodedDeposit);

            // Prevent this deposit from being bridged again.
            delete deposits[depositIds[i]];
        }

        // Deposit the amount of funds needed for newly processed deposits
        depositToken.approve(erc20TokenPredicate, depositAmount);
        rootChainManager.depositFor(address(this), address(depositToken), abi.encode(depositAmount));

        // Send a message to contract on Matic to allow recipients to withdraw
        _sendMessageToChild(depositMessage);

        emit BridgedDeposits(msg.sender, depositMessage, depositAmount);
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
