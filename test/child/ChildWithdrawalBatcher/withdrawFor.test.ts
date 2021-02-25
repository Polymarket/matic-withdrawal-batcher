/* eslint-disable func-names */
import { TypedDataDomain } from "@ethersproject/abstract-signer";
import { Wallet } from "@ethersproject/wallet";
import { arrayify, keccak256, _TypedDataEncoder } from "ethers/lib/utils";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
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

// Signers given by hardhat aren't flexible enough to perform the signature we need
// Private key holds zero funds
const JUNK_PRIVATE_KEY = "0xb284432e507043ac619a61aaadcea677f013c3c2300f8aea3a449f4d1b1fb524";
const balanceOwnerWallet = new Wallet(JUNK_PRIVATE_KEY);
const balanceOwner = balanceOwnerWallet.address;

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

  describe("withdrawFor", function () {
    describe("When user has insufficient balance", function () {
      it("reverts", async function () {
        await expect(childBatcher.withdraw(MAX_UINT96)).to.be.revertedWith(
          "Batcher: Insufficient balance for withdrawal",
        );
      });
    });

    describe("When user has sufficient balance", function () {
      const withdrawalAmounts: string[] = ["1", "100", "420"];
      const types = {
        Withdrawal: [
          { name: "balanceOwner", type: "address" },
          { name: "withdrawalReceiver", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      };
      let domain: TypedDataDomain;

      beforeEach(async function () {
        await childBatcher.depositFor(balanceOwner, "1000");
        domain = {
          name: "ChildWithdrawalBatcher",
          version: "1",
          chainId: network.config.chainId,
          verifyingContract: childBatcher.address,
        };
      });

      withdrawalAmounts.forEach(amount => {
        let value: any;
        let signature: string;
        beforeEach(async function () {
          value = {
            balanceOwner,
            withdrawalReceiver: admin,
            amount,
            nonce: 0,
          };
          // eslint-disable-next-line no-underscore-dangle
          signature = await balanceOwnerWallet._signTypedData(domain, types, value);
        });

        it("transfers the expected amount to the withdrawalReceiver", async function () {
          const receiverBalanceBefore = await token.balanceOf(admin);
          const contractBalanceBefore = await token.balanceOf(childBatcher.address);
          await childBatcher.withdrawFor(balanceOwner, admin, amount, signature);
          const receiverBalanceAfter = await token.balanceOf(admin);
          const contractBalanceAfter = await token.balanceOf(childBatcher.address);

          expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(amount);
          expect(receiverBalanceAfter.sub(receiverBalanceBefore)).to.eq(amount);
        });

        it("reduces the balanceOwner's balance by the withdrawal amount", async function () {
          const balanceOwnerBalanceBefore = await childBatcher.balanceOf(balanceOwner);
          await childBatcher.withdrawFor(balanceOwner, admin, amount, signature);
          const balanceOwnerBalanceAfter = await childBatcher.balanceOf(balanceOwner);

          expect(balanceOwnerBalanceAfter).to.eq(balanceOwnerBalanceBefore.sub(amount));
        });

        it("emits a Withdrawal event", async function () {
          expect(await childBatcher.withdrawFor(balanceOwner, admin, amount, signature))
            .to.emit(childBatcher, "Withdrawal")
            .withArgs(balanceOwner, admin, amount);
        });
      });
    });
  });
});
