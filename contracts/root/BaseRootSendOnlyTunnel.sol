pragma solidity ^0.6.8;

import { AccessControlMixin } from "../common/Matic/AccessControlMixin.sol";
import { IStateSender } from "./interfaces/IStateSender.sol";

/**
 * A copy of BaseRootTunnel with all methods + contracts related to receiving messages stripped out
 * This halves deployment costs.
 */
abstract contract BaseRootSendOnlyTunnel is AccessControlMixin {
    // keccak256(MessageSent(bytes))
    bytes32 public constant SEND_MESSAGE_EVENT_SIG = 0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036;

    // state sender contract
    IStateSender public stateSender;
    // child tunnel contract which receives and sends messages 
    address public childTunnel;

    constructor() internal {
      _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
      _setupContractId("RootTunnel");
    }

    /**
     * @notice Set the state sender, callable only by admins
     * @dev This should be the state sender from plasma contracts
     * It is used to send bytes from root to child chain
     * @param newStateSender address of state sender contract
     */
    function setStateSender(address newStateSender)
        external
        only(DEFAULT_ADMIN_ROLE)
    {
        stateSender = IStateSender(newStateSender);
    }

    /**
     * @notice Set the child chain tunnel, callable only by admins
     * @dev This should be the contract responsible to receive data bytes on child chain
     * @param newChildTunnel address of child tunnel contract
     */
    function setChildTunnel(address newChildTunnel)
        external
        only(DEFAULT_ADMIN_ROLE)
    {
        require(newChildTunnel != address(0x0), "RootTunnel: INVALID_CHILD_TUNNEL_ADDRESS");
        childTunnel = newChildTunnel;
    }

    /**
     * @notice Send bytes message to Child Tunnel
     * @param message bytes message that will be sent to Child Tunnel
     * some message examples -
     *   abi.encode(tokenId);
     *   abi.encode(tokenId, tokenMetadata);
     *   abi.encode(messageType, messageData);
     */
    function _sendMessageToChild(bytes memory message) internal {
        stateSender.syncState(childTunnel, message);
    }
}