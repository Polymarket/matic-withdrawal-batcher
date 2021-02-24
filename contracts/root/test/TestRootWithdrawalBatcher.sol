// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RootWithdrawalBatcher } from "../RootWithdrawalBatcher.sol";

/**
 * @dev Version of RootWithdrawalBatcher which allows manually increasing a user's balance for testing.
 */
contract TestRootWithdrawalBatcher is RootWithdrawalBatcher {

    /**
     * @dev constructor argument _childTunnel is needed for testing. In a production deploy this should be set to zero
     *      RootWithdrawalBatcherTunnel will then only accept messages from the a contract on the child chain at the same address as itself
     * @param _withdrawalToken - ERC20 token which this contract distributes
     * @param _checkpointManager - Address of contract containing Matic validator checkpoints
     * @param _childTunnel - address of contract which this contract accepts messages from. Set to 0 in a production deploy.
     */
    constructor(IERC20 _withdrawalToken, address _checkpointManager, address _childTunnel)
        public
        RootWithdrawalBatcher(_withdrawalToken,_checkpointManager, _childTunnel){

        }

    function increaseBalance(address balanceOwner, uint256 amount) public {
        balanceOf[balanceOwner] += amount;
    }
}