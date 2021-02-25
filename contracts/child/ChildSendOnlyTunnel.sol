// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

/**
* @notice Child tunnel contract to send message from L2
*/
abstract contract ChildSendOnlyTunnel {
    // MessageTunnel on L1 will get data from this event
    event MessageSent(bytes message);

    /**
     * @notice Emit message that can be received on Root Tunnel
     * @dev Call the internal function when need to emit message
     * @param message bytes message that will be sent to Root Tunnel
     * some message examples -
     *   abi.encode(tokenId);
     *   abi.encode(tokenId, tokenMetadata);
     *   abi.encode(messageType, messageData);
     */
    function _sendMessageToRoot(bytes memory message) internal {
        emit MessageSent(message);
    }
}