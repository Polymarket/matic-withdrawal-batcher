/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { Zero } from "@ethersproject/constants";
import { hexZeroPad } from "@ethersproject/bytes";
import { ChildWithdrawalBatcher, MockCheckpointManager, RootWithdrawalBatcher, TestERC20 } from "../../../typechain";
import { chai, deploy } from "../../helpers";
import { MAX_UINT96 } from "../../helpers/constants";
import { buildBridgeFundsProof } from "../../helpers/bridgeProof";
import { depositFunds } from "../../helpers/deposit";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  await deployments.fixture(["Matic"]);
  const checkpointManager = (await ethers.getContract("MockCheckpointManager")) as MockCheckpointManager;
  const token = (await ethers.getContract("TestERC20")) as TestERC20;

  const childBatcher = (await deploy("ChildWithdrawalBatcher", {
    args: [token.address, 0, 0, 1000],
  })) as ChildWithdrawalBatcher;

  const rootBatcher = (await deploy("RootWithdrawalBatcher", {
    args: [token.address, checkpointManager.address, childBatcher.address],
  })) as RootWithdrawalBatcher;

  return {
    checkpointManager,
    childBatcher,
    rootBatcher,
    token,
  };
});

const NUM_WITHDRAWALS = 250;
const deposits: [string, string][] = Array.from({ length: NUM_WITHDRAWALS }, (_, index) => [
  hexZeroPad(BigNumber.from(index).toHexString(), 20),
  (2 * index).toString(),
]);

const expectedBalances = deposits.reduce((acc, [recipient, amount]) => {
  acc[recipient] = (acc[recipient] || Zero).add(amount);
  return acc;
}, {} as { [key: string]: BigNumber });

describe("RootWithdrawalBatcher", function () {
  let rootBatcher: RootWithdrawalBatcher;
  let bridgeMessage: string;

  beforeEach(async function () {
    const deployment = await setup();
    rootBatcher = deployment.rootBatcher;
    const { checkpointManager, childBatcher, token } = deployment;
    const { admin } = await getNamedAccounts();
    await token["mint(address,uint256)"](admin, MAX_UINT96);
    await token.approve(childBatcher.address, MAX_UINT96);

    const bridgeFundsReceipt = await depositFunds(childBatcher, deposits);

    bridgeMessage = await buildBridgeFundsProof(bridgeFundsReceipt.transactionHash, checkpointManager);
  });

  describe.only("receiveMessage", function () {
    it("increases each recipient's internal balance correctly", async function () {
      await rootBatcher.receiveMessage(bridgeMessage, { gasLimit: 9500000 });

      await Promise.all(
        Object.entries(expectedBalances).map(async ([recipient, amount]) => {
          expect(await rootBatcher.balanceOf(recipient)).to.be.eq(amount);
        }),
      );
    });
  });
});
