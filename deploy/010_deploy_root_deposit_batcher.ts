import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { AddressZero } from "@ethersproject/constants";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;

  const { admin } = await getNamedAccounts();
  let depositToken: string;
  if (hre.network.name === "hardhat") {
    const tokenDeployment = await deployments.get("TestErc20");
    depositToken = tokenDeployment.address;
  } else {
    throw Error("Bad network");
  }

  await deployments.deploy("RootDepositBatcher", {
    from: admin,
    args: [depositToken, AddressZero, AddressZero],
    log: true,
  });
};

export default func;
func.tags = ["RootDepositBatcher"];
