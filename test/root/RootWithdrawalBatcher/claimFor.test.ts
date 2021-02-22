/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { Zero } from "@ethersproject/constants";
import { Wallet } from "ethers";
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

// Signers given by hardhat aren't flexible enough to perform the signature we need
// Private key holds zero funds
const JUNK_PRIVATE_KEY = "0xb284432e507043ac619a61aaadcea677f013c3c2300f8aea3a449f4d1b1fb524";
const balanceOwnerWallet = new Wallet(JUNK_PRIVATE_KEY);
const balanceOwner = balanceOwnerWallet.address;

describe("RootWithdrawalBatcher", function () {
  let rootBatcher: RootWithdrawalBatcher;
  let token: TestERC20;
  let admin: string;
  beforeEach(async function () {
    const deployment = await setup();
    rootBatcher = deployment.rootBatcher;
    token = deployment.token;

    const { checkpointManager, childBatcher } = deployment;
    const namedAccounts = await getNamedAccounts();
    admin = namedAccounts.admin;

    const deposits: [string, string][] = [[balanceOwner, "100"]];

    await token["mint(address,uint256)"](admin, MAX_UINT96);
    await token.approve(childBatcher.address, MAX_UINT96);
    await token["mint(address,uint256)"](rootBatcher.address, MAX_UINT96);

    const bridgeFundsReceipt = await depositFunds(childBatcher, deposits);

    const bridgeMessage = await buildBridgeFundsProof(bridgeFundsReceipt.transactionHash, checkpointManager);
    await rootBatcher.receiveMessage(bridgeMessage);
  });

  describe.only("claimFor", function () {
    const claims = [{ recipient: balanceOwner, amount: "100", internalClaim: false }];
    let signature: string;

    beforeEach("User signs approval for claim", async function () {
      if (network.config.chainId === undefined) {
        throw Error("No chainId");
      }

      const domain = {
        name: "RootWithdrawalBatcher",
        version: "1",
        chainId: network.config.chainId,
        verifyingContract: rootBatcher.address,
      };
      const types = {
        ClaimDistribution: [
          { name: "balanceOwner", type: "address" },
          { name: "claims", type: "Claim[]" },
          { name: "nonce", type: "uint256" },
        ],
        Claim: [
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "internalClaim", type: "bool" },
        ],
      };
      const value = {
        balanceOwner,
        claims,
        nonce: 0,
      };

      // eslint-disable-next-line no-underscore-dangle
      signature = await balanceOwnerWallet._signTypedData(domain, types, value);
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
  });
});
