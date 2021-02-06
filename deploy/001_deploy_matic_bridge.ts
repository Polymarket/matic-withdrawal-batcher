import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { solidityKeccak256 } from "ethers/lib/utils";
import { MockERC20Predicate, MockRootChainManager, MockStateSender, TestERC20 } from "../typechain";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;

  const { admin } = await getNamedAccounts();

  await deployments.deploy("MockStateSender", {
    from: admin,
    log: true,
  });

  await deployments.deploy("MockERC20Predicate", {
    from: admin,
    log: true,
  });

  await deployments.deploy("MockRootChainManager", {
    from: admin,
    log: true,
  });

  const token = (await ethers.getContract("TestERC20")) as TestERC20;
  const stateSender = (await ethers.getContract("MockStateSender")) as MockStateSender;
  const erc20Predicate = (await ethers.getContract("MockERC20Predicate")) as MockERC20Predicate;
  const rootChainManager = (await ethers.getContract("MockRootChainManager")) as MockRootChainManager;

  const MANAGER_ROLE = solidityKeccak256(["string"], ["MANAGER_ROLE"]);
  const TOKEN_TYPE_ID = solidityKeccak256(["string"], ["ERC20"]);
  await erc20Predicate.initialize(admin);
  await rootChainManager.initialize(admin);

  await erc20Predicate.grantRole(MANAGER_ROLE, rootChainManager.address);
  await rootChainManager.setStateSender(stateSender.address);
  await rootChainManager.registerPredicate(TOKEN_TYPE_ID, erc20Predicate.address);
  // Should map onto a different address but we don't care in this case we don't have a proper Matic setup
  await rootChainManager.mapToken(token.address, token.address, TOKEN_TYPE_ID);
};

export default func;
func.tags = ["Matic"];
func.dependencies = ["TestERC20"];
