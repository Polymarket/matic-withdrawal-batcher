/* eslint-disable func-names */
import { deployments, ethers, network } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, Zero } from "@ethersproject/constants";
import { Wallet } from "ethers";
import { TypedDataDomain } from "@ethersproject/abstract-signer";
import { RootWithdrawalBatcher, TestERC20, TestRootWithdrawalBatcher } from "../../../typechain";
import { chai, deploy } from "../../helpers";
import { MAX_UINT96 } from "../../helpers/constants";
import { Claim, signDistribution } from "../../helpers/distributionSignatures";

const { expect } = chai;

// Signers given by hardhat aren't flexible enough to perform the signature we need
// Private key holds zero funds
const JUNK_PRIVATE_KEY = "0xb284432e507043ac619a61aaadcea677f013c3c2300f8aea3a449f4d1b1fb524";
const balanceOwnerWallet = new Wallet(JUNK_PRIVATE_KEY);
const balanceOwner = balanceOwnerWallet.address;

const setup = deployments.createFixture(async () => {
  const token = (await ethers.getContract("TestERC20")) as TestERC20;

  const rootBatcher = (await deploy("TestRootWithdrawalBatcher", {
    args: [token.address, AddressZero, AddressZero],
  })) as TestRootWithdrawalBatcher;

  // We mint some tokens to the rootBatcher to simulate an exit from Matic
  await token["mint(address,uint256)"](rootBatcher.address, MAX_UINT96);
  // Give the balanceOwner an initial balance
  await rootBatcher.increaseBalance(balanceOwner, "100");

  return {
    rootBatcher: rootBatcher as RootWithdrawalBatcher,
    token,
  };
});

describe("RootWithdrawalBatcher", function () {
  let rootBatcher: RootWithdrawalBatcher;
  let token: TestERC20;
  let domain: TypedDataDomain;
  beforeEach(async function () {
    const deployment = await setup();
    rootBatcher = deployment.rootBatcher;
    token = deployment.token;

    domain = {
      name: "RootWithdrawalBatcher",
      version: "1",
      chainId: network.config.chainId,
      verifyingContract: rootBatcher.address,
    };
  });

  describe("claimFor", function () {
    describe("Claim with an invalid signature", function () {
      it("reverts", async function () {
        const adminSigner = await ethers.getNamedSigner("admin");
        const badSignature = await adminSigner.signMessage("I'm not the balanceOwner");
        expect(rootBatcher.claimFor(balanceOwner, [], badSignature)).to.be.revertedWith(
          "Batcher: distribution not signed by balanceOwner",
        );
      });
    });

    describe("Claim including an internal transfer to balanceOwner", function () {
      const claims: Claim[] = [{ recipient: balanceOwner, amount: "100", internalClaim: true }];
      let signature: string;

      beforeEach("User signs approval for claim", async function () {
        signature = await signDistribution(balanceOwnerWallet, domain, claims);
      });

      it("reverts", async function () {
        expect(rootBatcher.claimFor(balanceOwner, claims, signature)).to.be.revertedWith(
          "Batcher: internal transfer to balanceOwner disallowed",
        );
      });
    });

    describe("When claim distribution size exceeds balanceOwner's balance", function () {
      const claims: Claim[] = [
        { recipient: balanceOwner, amount: "100", internalClaim: false },
        { recipient: balanceOwner, amount: "1", internalClaim: false },
      ];
      let signature: string;

      beforeEach("User signs approval for claim", async function () {
        signature = await signDistribution(balanceOwnerWallet, domain, claims);
      });

      it("reverts", async function () {
        expect(rootBatcher.claimFor(balanceOwner, claims, signature)).to.be.revertedWith(
          "Batcher: distribution amount exceeds balanceOwner's balance",
        );
      });
    });

    describe("Simple claim to single address", function () {
      const claims: Claim[] = [{ recipient: balanceOwner, amount: "100", internalClaim: false }];
      let signature: string;

      beforeEach("User signs approval for claim", async function () {
        signature = await signDistribution(balanceOwnerWallet, domain, claims);
      });

      it("transfers the expected amount to the recipient", async function () {
        const userBalanceBefore = await token.balanceOf(claims[0].recipient);
        await rootBatcher.claimFor(balanceOwner, claims, signature);
        const userBalanceAfter = await token.balanceOf(claims[0].recipient);

        expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(claims[0].amount);
      });

      it("it reduces the balanceOwner's internal balance by the total claim amount", async function () {
        const internalBalanceBefore = await rootBatcher.balanceOf(balanceOwner);
        await rootBatcher.claimFor(balanceOwner, claims, signature);
        const internalBalanceAfter = await rootBatcher.balanceOf(balanceOwner);

        const totalClaimAmount = claims.reduce((acc, claim) => BigNumber.from(acc).add(claim.amount), Zero);
        expect(internalBalanceBefore.sub(internalBalanceAfter)).to.be.eq(totalClaimAmount);
      });

      it("increments the balanceOwner's nonce", async function () {
        const nonceBefore = await rootBatcher.claimNonce(balanceOwner);
        await rootBatcher.claimFor(balanceOwner, claims, signature);
        const nonceAfter = await rootBatcher.claimNonce(balanceOwner);

        expect(nonceAfter.sub(nonceBefore)).to.eq(1);
      });
    });

    describe("Simple claim with internal fee", function () {
      const claims: Claim[] = [
        { recipient: balanceOwner, amount: "50", internalClaim: false },
        { recipient: AddressZero, amount: "50", internalClaim: true },
      ];
      let signature: string;

      beforeEach("User signs approval for claim", async function () {
        signature = await signDistribution(balanceOwnerWallet, domain, claims);
      });

      it("transfers the expected amount to the recipient", async function () {
        const { amount, recipient } = claims[0];
        const userBalanceBefore = await token.balanceOf(recipient);
        await rootBatcher.claimFor(balanceOwner, claims, signature);
        const userBalanceAfter = await token.balanceOf(recipient);

        expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(amount);
      });

      it("transfers the expected amount to fee taker's internal balance", async function () {
        const { amount, recipient } = claims[1];
        const feeTakerInternalBalanceBefore = await rootBatcher.balanceOf(recipient);
        await rootBatcher.claimFor(balanceOwner, claims, signature);
        const feeTakerInternalBalanceAfter = await rootBatcher.balanceOf(recipient);

        expect(feeTakerInternalBalanceAfter.sub(feeTakerInternalBalanceBefore)).to.eq(amount);
      });

      it("it reduces the balanceOwner's internal balance by the total claim amount", async function () {
        const internalBalanceBefore = await rootBatcher.balanceOf(balanceOwner);
        await rootBatcher.claimFor(balanceOwner, claims, signature);
        const internalBalanceAfter = await rootBatcher.balanceOf(balanceOwner);

        const totalClaimAmount = claims.reduce((acc, claim) => BigNumber.from(acc).add(claim.amount), Zero);
        expect(internalBalanceBefore.sub(internalBalanceAfter)).to.be.eq(totalClaimAmount);
      });

      it("increments the balanceOwner's nonce", async function () {
        const nonceBefore = await rootBatcher.claimNonce(balanceOwner);
        await rootBatcher.claimFor(balanceOwner, claims, signature);
        const nonceAfter = await rootBatcher.claimNonce(balanceOwner);

        expect(nonceAfter.sub(nonceBefore)).to.eq(1);
      });
    });
  });
});
