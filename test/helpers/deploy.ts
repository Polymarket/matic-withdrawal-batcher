import { Contract, Signer } from "ethers";
import { deployments, ethers } from "hardhat";

export async function deploy(
  deploymentName: string,
  { from, args, connect }: { from?: string; args: Array<unknown>; connect?: Signer },
  contractName: string = deploymentName,
): Promise<Contract> {
  // Unless overridden, deploy from named address "admin"
  if (from === undefined) {
    const deployer = await ethers.getNamedSigner("admin");
    // eslint-disable-next-line no-param-reassign
    from = deployer.address;
  }

  const deployment = await deployments.deploy(deploymentName, {
    from,
    contract: contractName,
    args,
    log: true,
  });

  const instance = await ethers.getContractAt(deploymentName, deployment.address);

  return connect ? instance.connect(connect) : instance;
}
