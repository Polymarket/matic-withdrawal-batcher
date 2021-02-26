/* eslint-disable func-names */
import { AddressZero } from "@ethersproject/constants";
import { deployments, ethers } from "hardhat";
import { ChildWithdrawalBatcher } from "../../../typechain";
import { chai, deploy } from "../../helpers";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  const childBatcher = (await deploy("ChildWithdrawalBatcher", {
    args: [AddressZero, 0, 0, 0],
  })) as ChildWithdrawalBatcher;

  return {
    childBatcher,
  };
});

describe("ChildWithdrawalBatcher", function () {
  let childBatcher: ChildWithdrawalBatcher;

  beforeEach(async function () {
    const deployment = await setup();
    childBatcher = deployment.childBatcher;
  });

  describe("setMaxWithdrawalRecipients", function () {
    describe("when called by admin", function () {
      it("updates minWithdrawalAmount", async function () {
        expect(await childBatcher.maxWithdrawalRecipients()).to.be.eq(0);
        await childBatcher.setMaxWithdrawalRecipients(1);
        expect(await childBatcher.maxWithdrawalRecipients()).to.be.eq(1);
      });
    });
    describe("when called by a non-admin", function () {
      it("reverts", async function () {
        const [nonAdminAccount] = await ethers.getUnnamedSigners();
        await expect(childBatcher.connect(nonAdminAccount).setMaxWithdrawalRecipients(1)).to.be.revertedWith(
          "ChildWithdrawalBatcher: INSUFFICIENT_PERMISSIONS",
        );
      });
    });
  });
});
