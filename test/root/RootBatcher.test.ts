/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { MockERC20Predicate, MockRootChainManager, MockStateSender, RootBatcher, TestErc20 } from "../../typechain";
import { chai, encodeDeposit, encodeDepositMessage } from "../helpers";
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

const deposits: [string, BigNumber][] = [["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", BigNumber.from("100")]];

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
    deposits.forEach(([recipient, amount]) => {
      it("transfers the expected amount to the contract", async function () {
        const userBalanceBefore = await token.balanceOf(admin);
        const contractBalanceBefore = await token.balanceOf(rootBatcher.address);
        await rootBatcher.deposit(recipient, amount);
        const userBalanceAfter = await token.balanceOf(admin);
        const contractBalanceAfter = await token.balanceOf(rootBatcher.address);

        expect(contractBalanceAfter.sub(contractBalanceBefore)).to.eq(amount);
        expect(userBalanceBefore.sub(userBalanceAfter)).to.eq(amount);
      });

      it("increases the recipients balance by the deposit amount", async function () {
        const recipientBalanceBefore = await rootBatcher.balance(recipient);
        await rootBatcher.deposit(recipient, amount);
        const recipientBalanceAfter = await rootBatcher.balance(recipient);

        expect(recipientBalanceAfter).to.eq(recipientBalanceBefore.add(amount));
      });

      it("emits a Deposit event", async function () {
        expect(await rootBatcher.deposit(recipient, amount))
          .to.emit(rootBatcher, "Deposit")
          .withArgs(admin, recipient, amount);
      });
    });

    it("does not allow deposits that needs more than 32 bytes to encode", async function () {
      const recipient = deposits[0][0];
      const badAmount = MAX_UINT96.add(1);
      await expect(rootBatcher.deposit(recipient, badAmount)).to.be.rejectedWith("value out-of-bounds");
    });
  });

  describe("bridgeDeposits", function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const totalDepositAmount = deposits.map(([_, amount]) => amount).reduce((a, b) => a.add(b));
    const encodedDeposits = deposits.map(([address, amount]) => encodeDeposit(address, amount));
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
      await rootBatcher.bridgeDeposits(encodedDeposits);
      const erc20PredicateBalanceAfter = await token.balanceOf(erc20Predicate.address);
      const contractBalanceAfter = await token.balanceOf(rootBatcher.address);

      expect(erc20PredicateBalanceAfter.sub(erc20PredicateBalanceBefore)).to.eq(totalDepositAmount);
      expect(contractBalanceBefore.sub(contractBalanceAfter)).to.eq(totalDepositAmount);
    });

    it("sends a message to child contract of the processed deposits", async function () {
      expect(await rootBatcher.bridgeDeposits(encodedDeposits))
        .to.emit(stateSender, "StateSynced")
        .withArgs(1, stateSender.address /* This should be the child contract address */, expectedDepositMessage);
    });

    it("emits a BridgedDeposits event", async function () {
      expect(await rootBatcher.bridgeDeposits(encodedDeposits))
        .to.emit(rootBatcher, "BridgedDeposits")
        .withArgs(admin, expectedDepositMessage, totalDepositAmount);
    });

    it("sets the balances of users who have had funds bridged to zero", async function () {
      // Should be nonzero before
      await Promise.all(deposits.map(async ([recipient]) => expect(await rootBatcher.balance(recipient)).to.not.eq(0)));
      await rootBatcher.bridgeDeposits(encodedDeposits);
      // Should be zero after
      await Promise.all(deposits.map(async ([recipient]) => expect(await rootBatcher.balance(recipient)).to.eq(0)));
    });
  });
});
