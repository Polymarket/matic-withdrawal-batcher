import { buildReceiptProof, encodePayload, EventSignature } from "@tomfrench/matic-proofs";
import { solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { MockCheckpointManager } from "../../typechain";

/**
 * Builds a checkpoint containing a given block
 */
export const constructCheckpoint = async (blockHash: string, checkpointManager: MockCheckpointManager): Promise<number> => {
    const bridgeBlock = await ethers.provider.perform("getBlock", { blockHash });

    const CHECKPOINT_ID = 10000;
    const rootHash = solidityKeccak256(
      ["uint256", "uint256", "bytes32", "bytes32"],
      [bridgeBlock.number, bridgeBlock.timestamp, bridgeBlock.transactionsRoot, bridgeBlock.receiptsRoot],
    );
    await checkpointManager.setCheckpoint(CHECKPOINT_ID, rootHash, bridgeBlock.number, bridgeBlock.number);

    return CHECKPOINT_ID;
  };

  /**
   *
   * @param childBatcherContract
   * @param checkpointManagerContract
   * @param deposits
   */
  export const buildBridgeFundsProof = async (
    bridgeFundsTxHash: string,
    checkpointManagerContract: MockCheckpointManager,
  ): Promise<string> => {
    // Send a message containing the deposits
    const bridgeReceipt = await ethers.provider.getTransactionReceipt(bridgeFundsTxHash);
    const bridgeBlock = await ethers.provider.perform("getBlock", { blockHash: bridgeReceipt.blockHash });

    // Simulate Matic checkpointing behaviour
    const checkpointId = await constructCheckpoint(bridgeBlock.hash, checkpointManagerContract);

    // Build a proof of log inclusion for the BridgedWithdrawals log
    const receiptProof = await buildReceiptProof(ethers.provider, bridgeReceipt.transactionHash);
    const logIndex = bridgeReceipt.logs.findIndex(log => log.topics[0] === EventSignature.SendMessage);

    return encodePayload({
      headerBlockNumber: checkpointId,
      blockProof: [], // No proof needed as checkpoint only includes block of interest
      burnTxBlockNumber: bridgeBlock.number,
      burnTxBlockTimestamp: bridgeBlock.timestamp,
      transactionsRoot: bridgeBlock.transactionsRoot,
      receiptsRoot: bridgeBlock.receiptsRoot,
      receipt: bridgeReceipt,
      receiptProofParentNodes: receiptProof.parentNodes,
      receiptProofPath: receiptProof.path,
      logIndex,
    });
  };