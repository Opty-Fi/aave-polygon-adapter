// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "solidity-coverage";
import { resolve, join } from "path";
import fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig, NetworkUserConfig } from "hardhat/types";
import { ePolygonNetwork } from "./helpers/types";
import { NETWORKS_RPC_URL, buildForkConfig, NETWORKS_CHAIN_ID, NETWORKS_DEFAULT_GAS } from "./helper-hardhat-config";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const SKIP_LOAD = process.env.SKIP_LOAD === "true";
const MNEMONIC_PATH = "m/44'/60'/0'/0";
const MNEMONIC = process.env.MNEMONIC || "";
const NETWORK = process.env.NETWORK || "hardhat";

// Prevent to load scripts before compilation and typechain
if (!SKIP_LOAD) {
  ["polygon"].forEach(folder => {
    const tasksPath = join(__dirname, "tasks", folder);
    fs.readdirSync(tasksPath)
      .filter(pth => pth.includes(".ts"))
      .forEach(task => {
        require(`${tasksPath}/${task}`);
      });
  });
  require("./tasks/accounts");
  require("./tasks/clean");
}

const getCommonNetworkConfig = (networkName: eNetwork): NetworkUserConfig | undefined => ({
  url: NETWORKS_RPC_URL[networkName],
  gasPrice: "auto",
  chainId: NETWORKS_CHAIN_ID[networkName],
  initialBaseFeePerGas: 1_00_000_000,
  accounts: {
    mnemonic: MNEMONIC,
    path: MNEMONIC_PATH,
    initialIndex: 0,
    count: 20,
    accountsBalance: "10000000000000000000000",
  },
});

const config: HardhatUserConfig = {
  networks: {
    matic: getCommonNetworkConfig(ePolygonNetwork.matic),
    mumbai: getCommonNetworkConfig(ePolygonNetwork.mumbai),
    hardhat: {
      gasPrice: NETWORKS_DEFAULT_GAS[NETWORK],
      chainId: NETWORKS_CHAIN_ID[NETWORK],
      accounts: {
        initialIndex: 0,
        count: 20,
        mnemonic: MNEMONIC,
        path: MNEMONIC_PATH,
        accountsBalance: "10000000000000000000000",
      },
      forking: buildForkConfig(),
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.11",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  mocha: {
    timeout: 0,
  },
};

export default config;
