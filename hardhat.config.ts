import { HardhatUserConfig } from "hardhat/config";
import { ChainId, getRemoteNetworkConfig, mnemonic } from "./config";

import "./tasks/accounts";
import "./tasks/clean";
import "./tasks/deploy-child-batcher";
import "./tasks/deploy-root-batcher";

import "hardhat-deploy";
// To make hardhat-waffle compatible with hardhat-deploy
// we have aliased hardhat-ethers to hardhat-ethers-deploy in package.json
import "@nomiclabs/hardhat-waffle";
import "hardhat-gas-reporter";
import "hardhat-typechain";
import "solidity-coverage";

const accounts = {
  count: 10,
  initialIndex: 0,
  mnemonic,
  path: "m/44'/60'/0'/0",
};

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    admin: 0,
  },
  networks: {
    hardhat: {
      chainId: ChainId.hardhat,
    },
    goerli: { accounts, ...getRemoteNetworkConfig("goerli") },
    mumbai: { accounts, ...getRemoteNetworkConfig("mumbai") },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.6.8",
    settings: {
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 100,
    excludeContracts: ["Mock", "ERC20"],
  },
};

export default config;
