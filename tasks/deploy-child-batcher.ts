import { task } from "hardhat/config";
import { ChainId } from "../config";
import { MAX_UINT96 } from "../test/helpers/constants";
import { TASK_DEPLOY_CHILD } from "./task-names";

task(TASK_DEPLOY_CHILD, "Deploys a ChildWithdrawalBatcher contract to the selected network")
  .addParam("withdrawalToken", "The address of the child token to be used")
  .setAction(async (_taskArgs, hre) => {
    const { deployments, getNamedAccounts, getChainId } = hre;

    const chainId = parseInt(await getChainId(), 10);
    if (chainId !== ChainId.matic && chainId !== ChainId.mumbai) {
      throw Error("This contract should not be deployed to this network");
    }
    const { admin } = await getNamedAccounts();

    await deployments.deploy("ChildWithdrawalBatcher", {
      from: admin,
      args: [_taskArgs.withdrawalToken, 0, MAX_UINT96],
      log: true,
    });
  });
