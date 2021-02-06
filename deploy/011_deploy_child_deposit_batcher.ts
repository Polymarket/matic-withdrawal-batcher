import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;

  const { admin } = await getNamedAccounts();
  let depositToken: string;
  if (hre.network.name === "hardhat") {
    const tokenDeployment = await deployments.get("TestERC20");
    depositToken = tokenDeployment.address;
  } else {
    throw Error("Bad network");
  }

  await deployments.deploy("ChildDepositBatcher", {
    from: admin,
    args: [depositToken],
    log: true,
  });
};

export default func;
func.tags = ["ChildDepositBatcher"];
