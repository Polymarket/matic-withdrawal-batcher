// SPDX-License-Identifier: MIT

pragma solidity ^0.6.8;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import { RLPReader } from "./lib/RLPReader.sol";
import { MerklePatriciaProof } from "./lib/MerklePatriciaProof.sol";
import { ICheckpointManager } from "./interfaces/ICheckpointManager.sol";
import { RLPReader } from "./lib/RLPReader.sol";
import { MerklePatriciaProof } from "./lib/MerklePatriciaProof.sol";
import { Merkle } from "./lib/Merkle.sol";

abstract contract RootWithdrawalBatcherTunnel {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;
    using Merkle for bytes32;
    using SafeMath for uint256;

    bytes32 public constant SEND_MESSAGE_EVENT_SIG = keccak256("MessageSent(bytes)");

    // root chain manager
    ICheckpointManager public immutable checkpointManager;
    // child tunnel contract which receives and sends messages 
    address public immutable childTunnel;
    // storage to avoid duplicate exits
    mapping(bytes32 => bool) public processedExits;

    constructor(address _checkpointManager, address _childTunnel) internal {      
        checkpointManager = ICheckpointManager(_checkpointManager);
        childTunnel = _childTunnel != address(0x0) ? _childTunnel : address(this);
    }

    function _validateAndExtractMessage(bytes memory inputData) internal returns (bytes memory) {
        RLPReader.RLPItem[] memory inputDataRLPList = inputData
            .toRlpItem()
            .toList();

        // checking if exit has already been processed
        // unique exit is identified using hash of (blockNumber, branchMask, receiptLogIndex)
        bytes32 exitHash = keccak256(
            abi.encodePacked(
                inputDataRLPList[2].toUint(), // blockNumber
                // first 2 nibbles are dropped while generating nibble array
                // this allows branch masks that are valid but bypass exitHash check (changing first 2 nibbles only)
                // so converting to nibble array and then hashing it
                MerklePatriciaProof._getNibbleArray(inputDataRLPList[8].toBytes()), // branchMask
                inputDataRLPList[9].toUint() // receiptLogIndex
            )
        );
        require(
            processedExits[exitHash] == false,
            "RootTunnel: EXIT_ALREADY_PROCESSED"
        );
        processedExits[exitHash] = true;

        RLPReader.RLPItem[] memory receiptRLPList = inputDataRLPList[6]
            .toBytes()
            .toRlpItem()
            .toList();
        RLPReader.RLPItem memory logRLP = receiptRLPList[3]
            .toList()[
                inputDataRLPList[9].toUint() // receiptLogIndex
            ];

        RLPReader.RLPItem[] memory logRLPList = logRLP.toList();
        
        // check child tunnel
        require(childTunnel == RLPReader.toAddress(logRLPList[0]), "RootTunnel: INVALID_CHILD_TUNNEL");

        // verify receipt inclusion
        require(
            MerklePatriciaProof.verify(
                inputDataRLPList[6].toBytes(), // receipt
                inputDataRLPList[8].toBytes(), // branchMask
                inputDataRLPList[7].toBytes(), // receiptProof
                bytes32(inputDataRLPList[5].toUint()) // receiptRoot
            ),
            "RootTunnel: INVALID_RECEIPT_PROOF"
        );

        // verify checkpoint inclusion
        _checkBlockMembershipInCheckpoint(
            inputDataRLPList[2].toUint(), // blockNumber
            inputDataRLPList[3].toUint(), // blockTime
            bytes32(inputDataRLPList[4].toUint()), // txRoot
            bytes32(inputDataRLPList[5].toUint()), // receiptRoot
            inputDataRLPList[0].toUint(), // headerNumber
            inputDataRLPList[1].toBytes() // blockProof
        );

        RLPReader.RLPItem[] memory logTopicRLPList = logRLPList[1].toList(); // topics

        require(
            bytes32(logTopicRLPList[0].toUint()) == SEND_MESSAGE_EVENT_SIG, // topic0 is event sig
            "RootTunnel: INVALID_SIGNATURE"
        );

        // received message data
        bytes memory receivedData = logRLPList[2].toBytes();
        (bytes memory message) = abi.decode(receivedData, (bytes)); // event decodes params again, so decoding bytes to get message
        return message;
    }

    function _checkBlockMembershipInCheckpoint(
        uint256 blockNumber,
        uint256 blockTime,
        bytes32 txRoot,
        bytes32 receiptRoot,
        uint256 headerNumber,
        bytes memory blockProof
    ) private view returns (uint256) {
        (
            bytes32 headerRoot,
            uint256 startBlock,
            ,
            uint256 createdAt,

        ) = checkpointManager.headerBlocks(headerNumber);

        require(
            keccak256(
                abi.encodePacked(blockNumber, blockTime, txRoot, receiptRoot)
            )
                .checkMembership(
                blockNumber.sub(startBlock),
                headerRoot,
                blockProof
            ),
            "RootTunnel: INVALID_HEADER"
        );
        return createdAt;
    }

    /**
     * @notice receive message from L2 to L1, validated by proof
     * @dev This function verifies if the transaction actually happened on child chain
     *
     * @param inputData RLP encoded data of the reference tx containing following list of fields
     *  0 - headerNumber - Checkpoint header block number containing the reference tx
     *  1 - blockProof - Proof that the block header (in the child chain) is a leaf in the submitted merkle root
     *  2 - blockNumber - Block number containing the reference tx on child chain
     *  3 - blockTime - Reference tx block time
     *  4 - txRoot - Transactions root of block
     *  5 - receiptRoot - Receipts root of block
     *  6 - receipt - Receipt of the reference transaction
     *  7 - receiptProof - Merkle proof of the reference receipt
     *  8 - branchMask - 32 bits denoting the path of receipt in merkle tree
     *  9 - receiptLogIndex - Log Index to read from the receipt
     */
    function receiveMessage(bytes memory inputData) public virtual {
        bytes memory message = _validateAndExtractMessage(inputData);
        _processMessageFromChild(message);
    }

    /**
     * @notice Process message received from Child Tunnel
     * @dev function needs to be implemented to handle message as per requirement
     * This is called by onStateReceive function.
     * Since it is called via a system call, any event will not be emitted during its execution.
     * @param message bytes message that was sent from Child Tunnel
     */
    function _processMessageFromChild(bytes memory message) virtual internal;
}