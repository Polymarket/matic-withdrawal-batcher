/* eslint-disable func-names */
import { deployments, ethers } from "hardhat";
import { BigNumber } from "ethers";
import { MockDepositEncoder } from "../../typechain";
import { chai } from "../helpers";
import { MAX_UINT96 } from "../helpers/constants";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  await deployments.fixture("MockDepositEncoder");
  const depositEncoder = (await ethers.getContract("MockDepositEncoder")) as MockDepositEncoder;

  return {
    depositEncoder,
  };
});

const testCases: [[string, BigNumber], string][] = [
  [
    ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", BigNumber.from("1")],
    "0xf35a15fa6dc1c11c8f242663fea308cd85688ada000000000000000000000001",
  ],
  [
    ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", MAX_UINT96],
    "0xf35a15fa6dc1c11c8f242663fea308cd85688adaffffffffffffffffffffffff",
  ],
];

describe("DepositEncoder", function () {
  let depositEncoder: MockDepositEncoder;
  before(async function () {
    const deployment = await setup();
    depositEncoder = deployment.depositEncoder;
  });

  describe("encodeDeposit", function () {
    testCases.forEach(([[recipient, amount], expectedEncodedDeposit]) => {
      it("correctly encodes deposit", async function () {
        expect(await depositEncoder.encodeDeposit(recipient, amount)).to.be.eq(expectedEncodedDeposit);
      });
    });

    it("rejects deposits that would result in overflowing 32 bytes", async function () {
      const recipient = testCases[0][0][0];
      const badAmount = MAX_UINT96.add(1);
      await expect(depositEncoder.encodeDeposit(recipient, badAmount)).to.be.rejectedWith("value out-of-bounds");
    });
  });

  describe("getDepositRecipient", function () {
    testCases.forEach(([[expectedRecipient], encodedDeposit]) => {
      it("correctly decodes recipient", async function () {
        expect(await depositEncoder.getDepositRecipient(encodedDeposit)).to.be.eq(expectedRecipient);
      });
    });
  });

  describe("getDepositAmount", function () {
    testCases.forEach(([[, expectedAmount], encodedDeposit]) => {
      it("correctly decodes amount", async function () {
        expect(await depositEncoder.getDepositAmount(encodedDeposit)).to.be.eq(expectedAmount);
      });
    });
  });

  describe("decodeDeposit", function () {
    testCases.forEach(([[expectedRecipient, expectedAmount], encodedDeposit]) => {
      it("correctly decodes both recipient and amount", async function () {
        const { recipient, amount } = await depositEncoder.decodeDeposit(encodedDeposit);
        expect(recipient).to.be.eq(expectedRecipient);
        expect(amount).to.be.eq(expectedAmount);
      });
    });
  });
});
