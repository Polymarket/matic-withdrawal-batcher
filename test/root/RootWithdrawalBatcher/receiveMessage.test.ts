/* eslint-disable func-names */
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { BigNumber } from "ethers";
import { Zero } from "@ethersproject/constants";
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
  ["0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA", "1"],
];

const expectedBalances = deposits.reduce((acc, [recipient, amount]) => {
  acc[recipient] = (acc[recipient] || Zero).add(amount);
  return acc;
}, {} as { [key: string]: BigNumber });

describe("RootWithdrawalBatcher", function () {
  let rootBatcher: RootWithdrawalBatcher;
  let bridgeMessage: string;

  beforeEach(async function () {
    const deployment = await setup();
    rootBatcher = deployment.rootBatcher;
    const { checkpointManager, childBatcher, token } = deployment;
    const { admin } = await getNamedAccounts();
    await token["mint(address,uint256)"](admin, MAX_UINT96);
    await token.approve(childBatcher.address, MAX_UINT96);

    const bridgeFundsReceipt = await depositFunds(childBatcher, deposits);

    bridgeMessage = await buildBridgeFundsProof(bridgeFundsReceipt.transactionHash, checkpointManager);
  });

  describe("receiveMessage", function () {
    it("increases each recipient's internal balance correctly", async function () {
      await rootBatcher.receiveMessage(bridgeMessage);

      await Promise.all(
        Object.entries(expectedBalances).map(async ([recipient, amount]) => {
          expect(await rootBatcher.balanceOf(recipient)).to.be.eq(amount);
        }),
      );
    });
  });
});
