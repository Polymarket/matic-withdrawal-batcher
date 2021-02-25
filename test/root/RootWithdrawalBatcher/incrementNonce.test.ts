/* eslint-disable func-names */
import { deployments, getNamedAccounts } from "hardhat";
import { AddressZero } from "@ethersproject/constants";
import { RootWithdrawalBatcher } from "../../../typechain";
import { chai, deploy } from "../../helpers";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  const rootBatcher = (await deploy("RootWithdrawalBatcher", {
    args: [AddressZero, AddressZero, AddressZero],
  })) as RootWithdrawalBatcher;

  return {
    rootBatcher,
  };
});

describe("RootWithdrawalBatcher", function () {
  let rootBatcher: RootWithdrawalBatcher;
  let admin: string;
  beforeEach(async function () {
    const deployment = await setup();
    rootBatcher = deployment.rootBatcher;
    const namedAccounts = await getNamedAccounts();
    admin = namedAccounts.admin;
  });

  describe("incrementNonce", function () {
    it("increments the caller's nonce", async function () {
      const nonceBefore = await rootBatcher.claimNonce(admin);
      await rootBatcher.incrementNonce();
      const nonceAfter = await rootBatcher.claimNonce(admin);

      expect(nonceAfter.sub(nonceBefore)).to.eq(1);
    });
  });
});
