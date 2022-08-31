import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import AaveAdapterParticulars from "@optyfi/defi-legos/polygon/aavev3";
import { AaveV3Adapter, TestDeFiAdapter } from "../typechain";
import { LiquidityPool, PoolItem, Signers } from "./types";
import { shouldBeHaveLikeAaveV3Adapter } from "./AaveV3Adapter.behavior";
const { pools }: { pools: LiquidityPool } = AaveAdapterParticulars;

describe("Aave V3 on Polygon", function () {
  before(async function () {
    this.signers = {} as Signers;
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers.alice = signers[1];
    this.signers.deployer = signers[2];
    this.signers.operator = signers[8];
    this.signers.riskOperator = signers[9];
    const registryArtifact: Artifact = await hre.artifacts.readArtifact("IAdapterRegistryBase");
    this.mockRegistry = await hre.waffle.deployMockContract(this.signers.deployer, registryArtifact.abi);
    await this.mockRegistry.mock.getOperator.returns(this.signers.operator.address);
    await this.mockRegistry.mock.getRiskOperator.returns(this.signers.riskOperator.address);
    const testDeFiAdapterArtifact = await hre.artifacts.readArtifact("TestDeFiAdapter");

    this.testDeFiAdapter = <TestDeFiAdapter>(
      await hre.waffle.deployContract(this.signers.deployer, testDeFiAdapterArtifact)
    );
    const aaveAdapterArtifact: Artifact = await hre.artifacts.readArtifact("AaveV3Adapter");
    this.aaveV3Adapter = <AaveV3Adapter>(
      await hre.waffle.deployContract(this.signers.deployer, aaveAdapterArtifact, [this.mockRegistry.address])
    );
  });
  Object.keys(pools).map((token: string) => {
    const poolItem: PoolItem = pools[token];
    shouldBeHaveLikeAaveV3Adapter(token, poolItem);
  });
});
