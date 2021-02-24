/* eslint-disable func-names */
import { deployments, getNamedAccounts } from "hardhat";
import { AddressZero } from "@ethersproject/constants";
import { RootWithdrawalBatcher, TestERC20, TestRootWithdrawalBatcher } from "../../../typechain";
import { chai, deploy } from "../../helpers";
import { MAX_UINT96 } from "../../helpers/constants";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  const token = (await deploy("TestERC20", { args: [] })) as TestERC20;

  const rootBatcher = (await deploy("TestRootWithdrawalBatcher", {
    args: [token.address, AddressZero, AddressZero],
  })) as TestRootWithdrawalBatcher;

  const { admin } = await getNamedAccounts();

  // We mint some tokens to the rootBatcher to simulate an exit from Matic
  await token["mint(address,uint256)"](rootBatcher.address, MAX_UINT96);
  // Give the balanceOwner an initial balance
  await rootBatcher.increaseBalance(admin, "100");

  return {
    rootBatcher: rootBatcher as RootWithdrawalBatcher,
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
    const namedAccounts = await getNamedAccounts();
    admin = namedAccounts.admin;
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
