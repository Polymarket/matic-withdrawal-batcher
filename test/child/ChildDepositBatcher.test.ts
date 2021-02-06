/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import { ChildDepositBatcher, TestERC20 } from "../../typechain";
import { chai, encodeDepositMessage } from "../helpers";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  await deployments.fixture(["TestERC20", "ChildDepositBatcher"]);
  const token = (await ethers.getContract("TestERC20")) as TestERC20;
  const childBatcher = (await ethers.getContract("ChildDepositBatcher")) as ChildDepositBatcher;

  return {
    childBatcher,
    token,
  };
});

describe("ChildDepositBatcher", function () {
  let childBatcher: ChildDepositBatcher;
  let token: TestERC20;
  let admin: string;
  let deposits: [string, BigNumber][];
  beforeEach(async function () {
    const deployment = await setup();
    childBatcher = deployment.childBatcher;
    token = deployment.token;
    const namedAccounts = await getNamedAccounts();
    admin = namedAccounts.admin;

    // This allows the admin to call the `onStateReceive` function
    await childBatcher.grantRole(solidityKeccak256(["string"], ["STATE_SYNCER_ROLE"]), admin);
    deposits = [
      ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", BigNumber.from("1")],
      [admin, BigNumber.from("10")],
    ];
  });

  describe("onStateReceive", function () {
    it("increases each recipients' internal balance correctly", async function () {
      const depositMessage = encodeDepositMessage(deposits);

      await childBatcher.onStateReceive(0, depositMessage);

      await Promise.all(
        deposits.map(async ([recipient, amount]) => {
          expect(await childBatcher.balance(recipient)).to.be.eq(amount);
        }),
      );
    });
  });

  describe("claim", function () {
    beforeEach("Seed with deposits to be claimed", async function () {
      const depositMessage = encodeDepositMessage(deposits);
      await childBatcher.onStateReceive(0, depositMessage);

      await token["mint(address,uint256)"](childBatcher.address, "100");
    });

    it("transfers the expected amount to the recipient", async function () {
      const userBalanceBefore = await token.balanceOf(admin);
      const contractBalanceBefore = await token.balanceOf(childBatcher.address);
      await childBatcher.claim();
      const userBalanceAfter = await token.balanceOf(admin);
      const contractBalanceAfter = await token.balanceOf(childBatcher.address);

      expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(10);
      expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(10);
    });

    it("it sets the recipient's internal balance to zero", async function () {
      expect(await childBatcher.balance(admin)).to.be.gt(0, "zero initial balance when testing claiming deposits");
      await childBatcher.claim();
      expect(await childBatcher.balance(admin)).to.be.eq(0);
    });
  });
});
