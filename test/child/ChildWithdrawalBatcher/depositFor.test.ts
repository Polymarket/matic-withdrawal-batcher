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
    args: [token.address, 100, 100],
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

  describe("depositFor", function () {
    const deposits: [string, string][] = [
      ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", "10"],
      ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", "300"],
    ];
    deposits.forEach(([recipient, amount]) => {
      it("transfers the expected amount to the contract", async function () {
        const userBalanceBefore = await token.balanceOf(admin);
        const contractBalanceBefore = await token.balanceOf(childBatcher.address);
        await childBatcher.depositFor(recipient, amount);
        const userBalanceAfter = await token.balanceOf(admin);
        const contractBalanceAfter = await token.balanceOf(childBatcher.address);

        expect(contractBalanceAfter.sub(contractBalanceBefore)).to.eq(amount);
        expect(userBalanceBefore.sub(userBalanceAfter)).to.eq(amount);
      });

      it("increases the recipients balance by the deposit amount", async function () {
        const recipientBalanceBefore = await childBatcher.balanceOf(recipient);
        await childBatcher.depositFor(recipient, amount);
        const recipientBalanceAfter = await childBatcher.balanceOf(recipient);

        expect(recipientBalanceAfter).to.eq(recipientBalanceBefore.add(amount));
      });

      it("emits a Deposit event", async function () {
        expect(await childBatcher.depositFor(recipient, amount))
          .to.emit(childBatcher, "Deposit")
          .withArgs(admin, recipient, amount);
      });
    });

    it("does not allow deposits that needs more than 32 bytes to encode", async function () {
      const recipient = deposits[0][0];
      const badAmount = MAX_UINT96.add(1);
      await expect(childBatcher.depositFor(recipient, badAmount)).to.be.rejectedWith("value out-of-bounds");
    });
  });
});
