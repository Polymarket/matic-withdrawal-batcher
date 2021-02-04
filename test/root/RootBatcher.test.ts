/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { RootBatcher, TestErc20 } from "../../typechain";
import { chai } from "../helpers";
import { MAX_UINT96 } from "../helpers/constants";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  await deployments.fixture(["TestErc20", "RootBatcher"]);
  const token = (await ethers.getContract("TestErc20")) as TestErc20;
  const rootBatcher = (await ethers.getContract("RootBatcher")) as RootBatcher;

  return {
    rootBatcher,
    token,
  };
});

const testCases: [[string, BigNumber], string][] = [
  [
    ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", BigNumber.from("1")],
    "0xf35a15fa6dc1c11c8f242663fea308cd85688ada000000000000000000000001",
  ],
];

describe("RootBatcher", function () {
  let rootBatcher: RootBatcher;
  let token: TestErc20;
  let admin: string;
  beforeEach(async function () {
    const deployment = await setup();
    rootBatcher = deployment.rootBatcher;
    token = deployment.token;
    const namedAccounts = await getNamedAccounts();
    admin = namedAccounts.admin;

    await token["mint(uint256)"]("100");
    await token.approve(rootBatcher.address, "100");
  });

  describe("deposit", function () {
    testCases.forEach(([[recipient, amount], expectedEncodedDeposit]) => {
      it("transfers the expected amount to the contract", async function () {
        const userBalanceBefore = await token.balanceOf(admin);
        const contractBalanceBefore = await token.balanceOf(rootBatcher.address);
        await rootBatcher.deposit(recipient, amount);
        const userBalanceAfter = await token.balanceOf(admin);
        const contractBalanceAfter = await token.balanceOf(rootBatcher.address);

        expect(contractBalanceAfter.sub(contractBalanceBefore)).to.eq(amount);
        expect(userBalanceBefore.sub(userBalanceAfter)).to.eq(amount);
      });

      it("stores an encoded deposit at the expected depositId", async function () {
        const nextDepositId = await rootBatcher.nextDepositId();
        await rootBatcher.deposit(recipient, amount);
        const encodedDeposit = await rootBatcher.deposits(nextDepositId);

        expect(encodedDeposit).to.eq(expectedEncodedDeposit);
      });

      it("increments nextDepositId", async function () {
        const nextDepositIdBefore = await rootBatcher.nextDepositId();
        await rootBatcher.deposit(recipient, amount);
        const nextDepositIdAfter = await rootBatcher.nextDepositId();

        expect(nextDepositIdAfter).to.eq(nextDepositIdBefore.add(1));
      });

      it("emits a Deposit event", async function () {
        expect(await rootBatcher.deposit(recipient, amount))
          .to.emit(rootBatcher, "Deposit")
          .withArgs(admin, recipient, amount);
      });
    });

    it("does not allow deposits that needs more than 32 bytes to encode", async function () {
      const recipient = testCases[0][0][0];
      const badAmount = MAX_UINT96.add(1);
      await expect(rootBatcher.deposit(recipient, badAmount)).to.be.rejectedWith("value out-of-bounds");
    });
  });

  describe("bridgeDeposits", function () {
    beforeEach("Seed with deposits", async function () {
      const recipient = "0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA";
      const amount = "1";
      await rootBatcher.deposit(recipient, amount);
      await rootBatcher.deposit(recipient, amount);
      await rootBatcher.deposit(recipient, amount);
      await rootBatcher.deposit(recipient, amount);
      await rootBatcher.deposit(recipient, amount);
    });

    it("transfers the expected amount to the erc20TokenPredicateProxy", async function () {
      // TODO: change hardcoded values
      const erc20PredicateBalanceBefore = await token.balanceOf(admin);
      const contractBalanceBefore = await token.balanceOf(rootBatcher.address);
      await rootBatcher.bridgeDeposits([0, 1, 2, 3, 4]);
      const erc20PredicateBalanceAfter = await token.balanceOf(admin);
      const contractBalanceAfter = await token.balanceOf(rootBatcher.address);

      expect(erc20PredicateBalanceAfter.sub(erc20PredicateBalanceBefore)).to.eq(5);
      expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(5);
    });

    it("sends a message to child contract of the processed deposits", async function () {
      // TODO: change hardcoded values
      expect(await rootBatcher.bridgeDeposits([0, 1, 2, 3, 4]))
        .to.emit("StateSyncer", "StateSynced")
        .withArgs("ID", "Child contract address", "DepositMessage");
    });

    it("emits a BridgedDeposits event", async function () {
      // TODO: change hardcoded values
      expect(await rootBatcher.bridgeDeposits([0, 1, 2, 3, 4]))
        .to.emit(rootBatcher, "BridgedDeposits")
        .withArgs(admin, "depositMessage", "depositAmount");
    });

    it("deletes the entries at the provided depositIds", async function () {
      // TODO: change hardcoded values
      const depositIds = [0, 1, 2, 3, 4];
      // Before bridging, we should be able to access the values of deposits array at these indices
      // afterwards they should all be deleted
      // (expect syntax is incorrect but need to check what exactly is returned when querying invalid index)
      await Promise.all(depositIds.map(async depositId => expect(await rootBatcher.deposits(depositId)).to.not.eq(0)));

      await rootBatcher.bridgeDeposits([0, 1, 2, 3, 4]);
      await Promise.all(depositIds.map(async depositId => expect(await rootBatcher.deposits(depositId)).to.eq(0)));
    });
  });
});
