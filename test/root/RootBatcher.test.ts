/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { HashZero } from "@ethersproject/constants";
import { MockERC20Predicate, MockRootChainManager, MockStateSender, RootBatcher, TestErc20 } from "../../typechain";
import { chai, encodeDepositMessage } from "../helpers";
import { MAX_UINT96 } from "../helpers/constants";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  await deployments.fixture("Matic");
  const token = (await ethers.getContract("TestErc20")) as TestErc20;
  const erc20Predicate = (await ethers.getContract("MockERC20Predicate")) as MockERC20Predicate;
  const rootChainManager = (await ethers.getContract("MockRootChainManager")) as MockRootChainManager;
  const stateSender = (await ethers.getContract("MockStateSender")) as MockStateSender;

  const namedAccounts = await getNamedAccounts();
  await deployments.deploy("RootBatcher", {
    from: namedAccounts.admin,
    args: [token.address, rootChainManager.address, erc20Predicate.address],
    log: true,
  });

  const rootBatcher = (await ethers.getContract("RootBatcher")) as RootBatcher;
  await rootBatcher.setStateSender(stateSender.address);

  await rootBatcher.setChildTunnel(stateSender.address);
  return {
    erc20Predicate,
    // rootChainManager,
    rootBatcher,
    stateSender,
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
  let erc20Predicate: MockERC20Predicate;
  let stateSender: MockStateSender;
  let admin: string;

  beforeEach(async function () {
    const deployment = await setup();
    erc20Predicate = deployment.erc20Predicate;
    rootBatcher = deployment.rootBatcher;
    stateSender = deployment.stateSender;
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
    const recipient = "0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA";
    const amount = BigNumber.from("1");
    const deposits: [string, BigNumber][] = [
      [recipient, amount],
      [recipient, amount],
      [recipient, amount],
      [recipient, amount],
      [recipient, amount],
    ];
    const depositIds = deposits.map((_, index) => index);
    const totalDepositAmount = deposits.map(([_, amount]) => amount).reduce((a, b) => a.add(b));
    const expectedDepositMessage = encodeDepositMessage(deposits);

    beforeEach("Seed with deposits", async function () {
      for (let i = 0; i < deposits.length; i += 1) {
        const [currentRecipient, currentAmount] = deposits[i];
        // eslint-disable-next-line no-await-in-loop
        await rootBatcher.deposit(currentRecipient, currentAmount);
      }
    });

    it("transfers the expected amount to the erc20TokenPredicateProxy", async function () {
      const erc20PredicateBalanceBefore = await token.balanceOf(erc20Predicate.address);
      const contractBalanceBefore = await token.balanceOf(rootBatcher.address);
      await rootBatcher.bridgeDeposits(depositIds);
      const erc20PredicateBalanceAfter = await token.balanceOf(erc20Predicate.address);
      const contractBalanceAfter = await token.balanceOf(rootBatcher.address);

      expect(erc20PredicateBalanceAfter.sub(erc20PredicateBalanceBefore)).to.eq(totalDepositAmount);
      expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(totalDepositAmount);
    });

    it("sends a message to child contract of the processed deposits", async function () {
      expect(await rootBatcher.bridgeDeposits(depositIds))
        .to.emit(stateSender, "StateSynced")
        .withArgs(1, stateSender.address /* This should be the child contract address */, expectedDepositMessage);
    });

    it("emits a BridgedDeposits event", async function () {
      expect(await rootBatcher.bridgeDeposits(depositIds))
        .to.emit(rootBatcher, "BridgedDeposits")
        .withArgs(admin, expectedDepositMessage, totalDepositAmount);
    });

    it("deletes the entries at the provided depositIds", async function () {
      // Before bridging, we should be able to access the values of deposits array at these indices
      // afterwards they should all be deleted
      await Promise.all(
        depositIds.map(async depositId => expect(await rootBatcher.deposits(depositId)).to.not.eq(HashZero)),
      );

      await rootBatcher.bridgeDeposits(depositIds);
      await Promise.all(
        depositIds.map(async depositId => expect(await rootBatcher.deposits(depositId)).to.eq(HashZero)),
      );
    });
  });
});
