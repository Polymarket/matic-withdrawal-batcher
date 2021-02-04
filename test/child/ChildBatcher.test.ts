/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { ChildBatcher, TestErc20 } from "../../typechain";
import { chai } from "../helpers";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  await deployments.fixture(["TestErc20", "RootBatcher"]);
  const token = (await ethers.getContract("TestErc20")) as TestErc20;
  const childBatcher = (await ethers.getContract("RootBatcher")) as ChildBatcher;

  return {
    childBatcher,
    token,
  };
});

const testCases: [[string, BigNumber], string][] = [
  [
    ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", BigNumber.from("1")],
    "0xf35a15fa6dc1c11c8f242663fea308cd85688ada000000000000000000000001",
  ],
];

describe("ChildBatcher", function () {
  let childBatcher: ChildBatcher;
  let token: TestErc20;
  let admin: string;
  beforeEach(async function () {
    const deployment = await setup();
    childBatcher = deployment.childBatcher;
    token = deployment.token;
    const namedAccounts = await getNamedAccounts();
    admin = namedAccounts.admin;
  });

  describe("onStateReceive", function () {
    testCases.forEach(([[recipient, amount], expectedEncodedDeposit]) => {
      it("increases each recipients internal balance correctly");
    });
  });

  describe("claim", function () {
    beforeEach(
      "Seed with deposits to be claimed",
      // async function () {

      // it("transfers the expected amount to the recipient", async function () {
      //   const userBalanceBefore = await token.balanceOf(admin);
      //   const contractBalanceBefore = await token.balanceOf(childBatcher.address);
      //   await childBatcher.claim();
      //   const userBalanceAfter = await token.balanceOf(admin);
      //   const contractBalanceAfter = await token.balanceOf(childBatcher.address);

      //   // TODO: enter correct amounts
      //   expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(5);
      //   expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(5);
      // }
    );

    it(
      "it sets the recipient's internal balance to zero",
      // , async function () {
      // expect(await childBatcher.pendingClaims(admin)).to.be.gt(
      //   0,
      //   "zero initial balance when testing claiming deposits",
      // );
      // await childBatcher.claim();
      // expect(await childBatcher.pendingClaims(admin)).to.be.eq(0);
      // }
    );
  });
});
