import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;

  const { admin } = await getNamedAccounts();

  await deployments.deploy("TestERC20", {
    from: admin,
    log: true,
  });
};

export default func;
func.tags = ["TestERC20"];
