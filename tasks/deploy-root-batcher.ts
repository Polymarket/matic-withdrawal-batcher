import { task } from "hardhat/config";
import { AddressZero } from "@ethersproject/constants";
import { ChainId } from "../config";
import { TASK_DEPLOY_ROOT } from "./task-names";

task(TASK_DEPLOY_ROOT, "Deploys a RootWithdrawalBatcher contract to the selected network")
  .addParam("withdrawalToken", "The address of the root token to be used")
  .setAction(async (_taskArgs, hre) => {
    const { deployments, getNamedAccounts, getChainId } = hre;

    let checkpointManagerAddress: string;
    const chainId = parseInt(await getChainId(), 10);
    if (chainId === ChainId.mainnet) {
      checkpointManagerAddress = "0x86E4Dc95c7FBdBf52e33D563BbDB00823894C287";
    } else if (chainId === ChainId.goerli) {
      checkpointManagerAddress = "0x2890bA17EfE978480615e330ecB65333b880928e";
    } else {
      throw Error("This contract should not be deployed to this network");
    }
    const { admin } = await getNamedAccounts();

    await deployments.deploy("RootWithdrawalBatcher", {
      from: admin,
      args: [_taskArgs.withdrawalToken, checkpointManagerAddress, AddressZero],
      log: true,
    });
  });
