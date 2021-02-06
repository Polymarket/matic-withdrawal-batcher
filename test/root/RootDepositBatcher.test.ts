/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { Zero } from "@ethersproject/constants";
import {
  MockERC20Predicate,
  MockRootChainManager,
  MockStateSender,
  RootDepositBatcher,
  TestERC20,
} from "../../typechain";
import { chai, encodeDeposit, encodeDepositMessage } from "../helpers";
import { MAX_UINT96 } from "../helpers/constants";

const { expect } = chai;

const setup = deployments.createFixture(async () => {
  await deployments.fixture("Matic");
  const token = (await ethers.getContract("TestERC20")) as TestERC20;
  const erc20Predicate = (await ethers.getContract("MockERC20Predicate")) as MockERC20Predicate;
  const rootChainManager = (await ethers.getContract("MockRootChainManager")) as MockRootChainManager;
  const stateSender = (await ethers.getContract("MockStateSender")) as MockStateSender;

  const namedAccounts = await getNamedAccounts();
  await deployments.deploy("RootDepositBatcher", {
    from: namedAccounts.admin,
    args: [token.address, rootChainManager.address, erc20Predicate.address],
    log: true,
  });

  const rootBatcher = (await ethers.getContract("RootDepositBatcher")) as RootDepositBatcher;
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

describe("RootDepositBatcher", function () {
  let rootBatcher: RootDepositBatcher;
  let token: TestERC20;
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

    await token["mint(uint256)"]("1000000000000");
    await token.approve(rootBatcher.address, "1000000000000");
  });

  describe("deposit", function () {
    const recipient = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";
    const amount = "300";

    beforeEach("Seed with another deposit", async function () {
      await rootBatcher.deposit(recipient, "100");
    });

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

    it("does not allow deposits that needs more than 32 bytes to encode", async function () {
      const badAmount = MAX_UINT96.add(1);
      await expect(rootBatcher.deposit(recipient, badAmount)).to.be.rejectedWith("value out-of-bounds");
    });
  });

  describe("bridgeDeposits", function () {
    // We include multiple deposits to the same recipient to ensure that these are properly consolidated
    const deposits: [string, string][] = [
      ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", "10"],
      ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", "10"],
      ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", "100"],
      ["0xdc76cd25977e0a5ae17155770273ad58648900d3", "10"],
      ["0x73BCEb1Cd57C711feaC4224D062b0F6ff338501e", "10"],
      ["0x3c97042B5FA4Ae3523498EF0DbaCD0a909423b52", "10"],
      ["0x229b5c097F9b35009CA1321Ad2034D4b3D5070F6", "10"],
      ["0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", "820000000"],
      ["0xe853c56864a2ebe4576a807d26fdc4a0ada51919", "10"],
      ["0x59448fe20378357F206880c58068f095ae63d5A5", "6"],
      ["0xf66852bC122fD40bFECc63CD48217E88bda12109", "10"],
      ["0x9BF4001d307dFd62B26A2F1307ee0C0307632d59", "10"],
      ["0xe0F5B79Ef9F748562A21D017Bb7a6706954b7585", "10"],
      ["0x2B6eD29A95753C3Ad948348e3e7b1A251080Ffb9", "50"],
      ["0xC098B2a3Aa256D2140208C3de6543aAEf5cd3A94", "10"],
      ["0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", "10000"],
      ["0x558553D54183a8542F7832742e7B4Ba9c33Aa1E6", "10"],
      ["0x1e2FCfd26d36183f1A5d90f0e6296915b02BCb40", "10"],
      ["0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", "10"],
      ["0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", "560"],
      ["0x189B9cBd4AfF470aF2C0102f365FC1823d857965", "10"],
      ["0x0a4c79cE84202b03e95B7a692E5D728d83C44c76", "10"],
      ["0x0548F59fEE79f8832C299e01dCA5c76F034F558e", "12"],
      ["0x701bd63938518d7DB7e0f00945110c80c67df532", "10"],
    ];

    const expectedBalances = deposits.reduce((acc, [recipient, amount]) => {
      acc[recipient] = (acc[recipient] || Zero).add(amount);
      return acc;
    }, {} as { [key: string]: BigNumber });

    const totalDepositAmount = Object.values(expectedBalances).reduce((a, b) => a.add(b));
    const encodedDeposits = Object.entries(expectedBalances).map(deposit => encodeDeposit(...deposit));
    const expectedDepositMessage = encodeDepositMessage(Object.entries(expectedBalances));

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
      await Promise.all(
        Object.entries(expectedBalances).map(async ([recipient, balance]) =>
          expect(await rootBatcher.balance(recipient)).to.eq(balance),
        ),
      );
      await rootBatcher.bridgeDeposits(encodedDeposits);
      // Should be zero after
      await Promise.all(
        Object.keys(expectedBalances).map(async recipient => expect(await rootBatcher.balance(recipient)).to.eq(0)),
      );
    });
  });
});
