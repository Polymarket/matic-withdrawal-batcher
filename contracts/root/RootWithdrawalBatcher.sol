// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RootWithdrawalBatcherTunnel } from "./RootWithdrawalBatcherTunnel.sol";
import { DepositEncoder } from "../common/DepositEncoder.sol";

contract RootWithdrawalBatcher is RootWithdrawalBatcherTunnel {
    using DepositEncoder for bytes32;

    event Claim(address indexed recipient, uint256 amount);

    IERC20 public immutable withdrawalToken;

    mapping(address=>uint256) public balance;

    /**
     * @dev constructor argument _childTunnel is needed for testing. In a production deploy this should be set to zero
     *      RootWithdrawalBatcherTunnel will then only accept messages from the a contract on the child chain at the same address as itself
     * @param _withdrawalToken - ERC20 token which this contract distributes
     * @param _checkpointManager - ERC20 token which this contract distributes
     * @param _childTunnel - address of contract which this contract accepts messages from. Set to 0 in a production deploy.
     */
    constructor(IERC20 _withdrawalToken, address _checkpointManager, address _childTunnel) public RootWithdrawalBatcherTunnel(_checkpointManager, _childTunnel) {
        withdrawalToken = _withdrawalToken;
    }

    /**
     * @notice Claim caller's balance, sending the tokens to their address
     */
    function claim() external {
        claimFor(msg.sender);
    }


    /**
     * @notice Claim a recipient's balance for them, sending the tokens to their address
     * @param recipient - the address of the recipient for which to claim
     */
    function claimFor(address recipient) public {
        uint256 amount = balance[recipient];
        balance[recipient] = 0;
        require(withdrawalToken.transfer(recipient, amount), "Token transfer failed");
        emit Claim(recipient, amount);
    }

    /**
     * @notice Process message received from Child Tunnel
     * @dev function needs to be implemented to handle message as per requirement
     * This is called by onStateReceive function.
     * Since it is called via a system call, any event will not be emitted during its execution.
     * @param message bytes message that was sent from Child Tunnel
     */
    function _processMessageFromChild(bytes memory message) override internal {
        distributeWithdrawals(message);
    }

    /**
     * @notice Distribute a batch of withdrawals to its recipients
     * @param message bytes object of packed encoded deposits
     */
    function distributeWithdrawals(bytes memory message) private {
        for (uint256 i = 32; i <= message.length; i = i + 32){
            // Each 32 bytes of the message corresponds to an encoded deposit
            bytes32 encodedWithdrawal;
            assembly {
                encodedWithdrawal := mload(add(message, i))
            }

            // Decode and add to user's balance
            (address recipient, uint96 amount) = encodedWithdrawal.decodeDeposit();
            balance[recipient] += amount;
        }
    }
}