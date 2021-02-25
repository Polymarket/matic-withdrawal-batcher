/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { ChildWithdrawalBatcher, TestERC20 } from "../../../typechain";
import { chai, deploy } from "../../helpers";
import { MAX_UINT96 } from "../../helpers/constants";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  await deployments.fixture("Matic");
  const token = (await ethers.getContract("TestERC20")) as TestERC20;

  const childBatcher = (await deploy("ChildWithdrawalBatcher", {
    args: [token.address, 100, 1, 100],
  })) as ChildWithdrawalBatcher;

  return {
    childBatcher,
    token,
  };
});

describe("ChildWithdrawalBatcher", function () {
  let childBatcher: ChildWithdrawalBatcher;
  let token: TestERC20;
  let admin: string;

  beforeEach(async function () {
    const deployment = await setup();
    childBatcher = deployment.childBatcher;
    token = deployment.token;
    const namedAccounts = await getNamedAccounts();
    admin = namedAccounts.admin;

    await token["mint(uint256)"]("1000000000000");
    await token.approve(childBatcher.address, "1000000000000");
  });

  describe("withdraw", function () {
    describe("When user has insufficient balance", function () {
      it("reverts", async function () {
        await expect(childBatcher.withdraw(MAX_UINT96)).to.be.revertedWith(
          "Batcher: Insufficient balance for withdrawal",
        );
      });
    });

    describe("When user has sufficient balance", function () {
      const withdrawalAmounts: string[] = ["1", "100", "420"];

      beforeEach(async function () {
        await childBatcher.depositFor(admin, "1000");
      });

      withdrawalAmounts.forEach(amount => {
        it("transfers the expected amount to the caller", async function () {
          const userBalanceBefore = await token.balanceOf(admin);
          const contractBalanceBefore = await token.balanceOf(childBatcher.address);
          await childBatcher.withdraw(amount);
          const userBalanceAfter = await token.balanceOf(admin);
          const contractBalanceAfter = await token.balanceOf(childBatcher.address);

          expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(amount);
          expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(amount);
        });

        it("reduces the recipients balance by the withdrawal amount", async function () {
          const recipientBalanceBefore = await childBatcher.balanceOf(admin);
          await childBatcher.withdraw(amount);
          const recipientBalanceAfter = await childBatcher.balanceOf(admin);

          expect(recipientBalanceAfter).to.eq(recipientBalanceBefore.sub(amount));
        });

        it("emits a Withdrawal event", async function () {
          expect(await childBatcher.withdraw(amount))
            .to.emit(childBatcher, "Withdrawal")
            .withArgs(admin, amount);
        });
      });
    });
  });
});
