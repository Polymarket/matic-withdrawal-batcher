/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
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
    args: [token.address, 0, 100],
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

describe("RootWithdrawalBatcher", function () {
  let rootBatcher: RootWithdrawalBatcher;
  let token: TestERC20;
  let admin: string;
  const amount = "100";
  beforeEach(async function () {
    const deployment = await setup();
    rootBatcher = deployment.rootBatcher;
    token = deployment.token;

    const { checkpointManager, childBatcher } = deployment;
    const namedAccounts = await getNamedAccounts();
    admin = namedAccounts.admin;

    await token["mint(address,uint256)"](admin, MAX_UINT96);
    await token.approve(childBatcher.address, MAX_UINT96);
    await token["mint(address,uint256)"](rootBatcher.address, MAX_UINT96);

    const bridgeFundsReceipt = await depositFunds(childBatcher, [[admin, amount]]);

    const bridgeMessage = await buildBridgeFundsProof(bridgeFundsReceipt.transactionHash, checkpointManager);
    await rootBatcher.receiveMessage(bridgeMessage);
  });

  describe("claim", function () {
    it("transfers the expected amount to the recipient", async function () {
      const userBalanceBefore = await token.balanceOf(admin);
      const contractBalanceBefore = await token.balanceOf(rootBatcher.address);
      await rootBatcher["claim()"]();
      const userBalanceAfter = await token.balanceOf(admin);
      const contractBalanceAfter = await token.balanceOf(rootBatcher.address);

      expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(amount);
      expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(amount);
    });

    it("it sets the recipient's internal balance to zero", async function () {
      expect(await rootBatcher.balanceOf(admin)).to.be.gt(0, "zero initial balance when testing claiming deposits");
      await rootBatcher["claim()"]();
      expect(await rootBatcher.balanceOf(admin)).to.be.eq(0);
    });
  });
});
