import { task, types } from "hardhat/config";
import { utils } from "ethers";
import { AaveAdapter, AaveAdapter__factory } from "../../typechain";

task("deploy-aave.finance-adapter", "Deploy Aave Adapter")
  .addParam("registry", "the address of registry", "", types.string)
  .setAction(async ({ registry }, { ethers }) => {
    if (registry === "") {
      throw new Error("registry cannot be empty");
    }

    if (!utils.isAddress(registry)) {
      throw new Error("registry address is invalid");
    }

    const AaveAdapterFactory: AaveAdapter__factory = await ethers.getContractFactory("AaveAdapter");
    const AaveAdapter: AaveAdapter = <AaveAdapter>await AaveAdapterFactory.deploy(registry);
    await AaveAdapter.deployed();
    console.log("AaveAdapter deployed to: ", AaveAdapter.address);
  });
