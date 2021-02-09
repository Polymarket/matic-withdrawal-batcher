/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { Zero } from "@ethersproject/constants";
import { buildReceiptProof, encodePayload } from "@tomfrench/matic-proofs";
import { solidityKeccak256 } from "ethers/lib/utils";
import { ChildWithdrawalBatcher, MockCheckpointManager, RootWithdrawalBatcher, TestERC20 } from "../../typechain";
import { chai, encodeDeposit } from "../helpers";
import { MAX_UINT96 } from "../helpers/constants";

const { expect } = chai;

const SEND_MESSAGE_EVENT_SIG = "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";

const setup = deployments.createFixture(async () => {
  await deployments.fixture(["Matic"]);
  const checkpointManager = (await ethers.getContract("MockCheckpointManager")) as MockCheckpointManager;
  const token = (await ethers.getContract("TestERC20")) as TestERC20;

  const namedAccounts = await getNamedAccounts();

  await deployments.deploy("ChildWithdrawalBatcher", {
    from: namedAccounts.admin,
    args: [token.address, 0, 100],
    log: true,
  });

  const childBatcher = (await ethers.getContract("ChildWithdrawalBatcher")) as ChildWithdrawalBatcher;

  await deployments.deploy("RootWithdrawalBatcher", {
    from: namedAccounts.admin,
    args: [token.address, checkpointManager.address, childBatcher.address],
    log: true,
  });

  const rootBatcher = (await ethers.getContract("RootWithdrawalBatcher")) as RootWithdrawalBatcher;

  return {
    checkpointManager,
    childBatcher,
    rootBatcher,
    token,
  };
});

const deposits: [string, string][] = [
  ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", "10"],
  ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", "10"],
  ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", "100"],
  ["0xdc76cd25977e0a5ae17155770273ad58648900d3", "10"],
  ["0x73BCEb1Cd57C711feaC4224D062b0F6ff338501e", "10"],
  ["0x3c97042B5FA4Ae3523498EF0DbaCD0a909423b52", "10"],
  ["0x229b5c097F9b35009CA1321Ad2034D4b3D5070F6", "10"],
  ["0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", "820000000"],
  ["0xe853c56864a2ebe4576a807d26fdc4a0ada51919", "10"],
  ["0x59448fe20378357F206880c58068f095ae63d5A5", "6"],
  ["0xf66852bC122fD40bFECc63CD48217E88bda12109", "10"],
  ["0x9BF4001d307dFd62B26A2F1307ee0C0307632d59", "10"],
  ["0xe0F5B79Ef9F748562A21D017Bb7a6706954b7585", "10"],
  ["0x2B6eD29A95753C3Ad948348e3e7b1A251080Ffb9", "50"],
  ["0xC098B2a3Aa256D2140208C3de6543aAEf5cd3A94", "10"],
  ["0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", "10000"],
  ["0x558553D54183a8542F7832742e7B4Ba9c33Aa1E6", "10"],
  ["0x1e2FCfd26d36183f1A5d90f0e6296915b02BCb40", "10"],
  ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", "10"],
  ["0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", "560"],
  ["0x189B9cBd4AfF470aF2C0102f365FC1823d857965", "10"],
  ["0x0a4c79cE84202b03e95B7a692E5D728d83C44c76", "10"],
  ["0x0548F59fEE79f8832C299e01dCA5c76F034F558e", "12"],
  ["0x701bd63938518d7DB7e0f00945110c80c67df532", "10"],
  ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", "1"],
];

const expectedBalances = deposits.reduce((acc, [recipient, amount]) => {
  acc[recipient] = (acc[recipient] || Zero).add(amount);
  return acc;
}, {} as { [key: string]: BigNumber });

/**
 * Builds a checkpoint containing a given block
 */
const constructCheckpoint = async (blockHash: string, checkpointManager: MockCheckpointManager): Promise<number> => {
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
const depositAndBridgeFunds = async (
  childBatcherContract: ChildWithdrawalBatcher,
  checkpointManagerContract: MockCheckpointManager,
  deposits: [string, string][],
): Promise<string> => {
  for (let i = 0; i < deposits.length; i += 1) {
    const [currentRecipient, currentAmount] = deposits[i];
    // eslint-disable-next-line no-await-in-loop
    await childBatcherContract.depositFor(currentRecipient, currentAmount);
  }

  // Deduplicate deposits to the same recipient
  const expectedBalances = deposits.reduce((acc, [recipient, amount]) => {
    acc[recipient] = (acc[recipient] || Zero).add(amount);
    return acc;
  }, {} as { [key: string]: BigNumber });
  const encodedDeposits = Object.entries(expectedBalances).map(deposit => encodeDeposit(...deposit));

  // Send a message containing the deposits
  const bridgeTx = await childBatcherContract.bridgeWithdrawals(encodedDeposits);
  const bridgeReceipt = await bridgeTx.wait();
  const bridgeBlock = await ethers.provider.perform("getBlock", { blockHash: bridgeReceipt.blockHash });

  // Simulate Matic checkpointing behaviour
  const checkpointId = await constructCheckpoint(bridgeBlock.hash, checkpointManagerContract);

  // Build a proof of log inclusion for the BridgedWithdrawals log
  const receiptProof = await buildReceiptProof(ethers.provider, bridgeTx.hash);
  const logIndex = bridgeReceipt.logs.findIndex(log => log.topics[0] === SEND_MESSAGE_EVENT_SIG);

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

describe("RootWithdrawalBatcher", function () {
  let checkpointManager: MockCheckpointManager;
  let childBatcher: ChildWithdrawalBatcher;
  let rootBatcher: RootWithdrawalBatcher;
  let token: TestERC20;

  beforeEach(async function () {
    const deployment = await setup();
    checkpointManager = deployment.checkpointManager;
    childBatcher = deployment.childBatcher;
    rootBatcher = deployment.rootBatcher;
    token = deployment.token;
    const { admin } = await getNamedAccounts();

    await token["mint(address,uint256)"](admin, MAX_UINT96);
    await token.approve(childBatcher.address, MAX_UINT96);
  });

  describe("receiveMessage", function () {
    it("increases each recipient's internal balance correctly", async function () {
      const bridgeMessage = await depositAndBridgeFunds(childBatcher, checkpointManager, deposits);

      await rootBatcher.receiveMessage(bridgeMessage);

      await Promise.all(
        Object.entries(expectedBalances).map(async ([recipient, amount]) => {
          expect(await rootBatcher.balance(recipient)).to.be.eq(amount);
        }),
      );
    });
  });

  describe("claim", function () {
    let admin: string;
    const amount = "100";
    beforeEach("Seed with withdrawal to be claimed", async function () {
      const namedAccounts = await getNamedAccounts();
      admin = namedAccounts.admin;

      const bridgeMessage = await depositAndBridgeFunds(childBatcher, checkpointManager, [[admin, amount]]);
      await rootBatcher.receiveMessage(bridgeMessage);

      await token["mint(address,uint256)"](rootBatcher.address, amount);
    });

    it("transfers the expected amount to the recipient", async function () {
      const userBalanceBefore = await token.balanceOf(admin);
      const contractBalanceBefore = await token.balanceOf(rootBatcher.address);
      await rootBatcher.claim();
      const userBalanceAfter = await token.balanceOf(admin);
      const contractBalanceAfter = await token.balanceOf(rootBatcher.address);

      expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(amount);
      expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(amount);
    });

    it("it sets the recipient's internal balance to zero", async function () {
      expect(await rootBatcher.balance(admin)).to.be.gt(0, "zero initial balance when testing claiming deposits");
      await rootBatcher.claim();
      expect(await rootBatcher.balance(admin)).to.be.eq(0);
    });
  });

  describe("claimFor", function () {
    beforeEach("Seed with withdrawal to be claimed", async function () {
      const bridgeMessage = await depositAndBridgeFunds(childBatcher, checkpointManager, deposits);
      await rootBatcher.receiveMessage(bridgeMessage);

      await token["mint(address,uint256)"](
        rootBatcher.address,
        Object.values(expectedBalances).reduce((a, b) => a.add(b)),
      );
    });

    Object.entries(expectedBalances).forEach(([recipient, amount]) => {
      it("transfers the expected amount to the recipient", async function () {
        const userBalanceBefore = await token.balanceOf(recipient);
        const contractBalanceBefore = await token.balanceOf(rootBatcher.address);
        await rootBatcher.claimFor(recipient);
        const userBalanceAfter = await token.balanceOf(recipient);
        const contractBalanceAfter = await token.balanceOf(rootBatcher.address);

        expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(amount);
        expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(amount);
      });

      it("it sets the recipient's internal balance to zero", async function () {
        expect(await rootBatcher.balance(recipient)).to.be.eq(
          amount,
          "zero initial balance when testing claiming deposits",
        );
        await rootBatcher.claimFor(recipient);
        expect(await rootBatcher.balance(recipient)).to.be.eq(0);
      });
    });
  });
});
