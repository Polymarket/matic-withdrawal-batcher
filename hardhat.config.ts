import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";
import { mnemonic, infuraApiKey, maticVigilApiKey } from "./config/env";
import "./tasks/accounts";
import "./tasks/clean";

import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-gas-reporter";
import "hardhat-typechain";
import "solidity-coverage";

enum ChainId {
  ganache = 1337,
  goerli = 5,
  hardhat = 31337,
  kovan = 42,
  mainnet = 1,
  matic = 137,
  mumbai = 80001,
  rinkeby = 4,
  ropsten = 3,
}

function createTestnetConfig(network: keyof typeof ChainId): NetworkUserConfig {
  const url = `https://${network}.infura.io/v3/${infuraApiKey}`;
  return {
    accounts: {
      count: 10,
      initialIndex: 0,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
    chainId: ChainId[network],
    url,
  };
}

function createMaticVigilConfig(network: keyof typeof ChainId): NetworkUserConfig {
  const url = `https://rpc-${network}.maticvigil.com/v1/${maticVigilApiKey}`;
  return {
    accounts: {
      count: 10,
      initialIndex: 0,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
    chainId: ChainId[network],
    url,
  };
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    admin: 0,
  },
  networks: {
    hardhat: {
      chainId: ChainId.hardhat,
    },
    goerli: createTestnetConfig("goerli"),
    mumbai: createMaticVigilConfig("mumbai"),
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
