import { PoolItem } from "./types";
import hre from "hardhat";
import { BigNumber } from "ethers";
import {
  IAaveV3LendingPoolAddressesProvider,
  IAaveV3LendingPoolAddressesProviderRegistry,
  IAaveV3RewardsController,
  IAaveV3,
  ERC20,
} from "../typechain";
import { AaveIncentivesController } from "@optyfi/defi-legos/polygon/aavev3";
import { expect } from "chai";
import { setTokenBalanceInStorage, moveToBlockAfterSeconds, CONTRACTS } from "./utils";
export function shouldBeHaveLikeAaveV3Adapter(token: string, pool: PoolItem): void {
  describe(`${token}, pool address : ${pool.pool}, lpToken address: ${pool.lpToken}`, async function () {
    let decimals: string;
    const { tokens, pool: providerRegistryAddress, lpToken } = pool;
    let lendingProviderRegistry: IAaveV3LendingPoolAddressesProviderRegistry;
    let lendingProvider: IAaveV3LendingPoolAddressesProvider;
    let lendingPool: IAaveV3;
    let incentiveContract: IAaveV3RewardsController;
    let lpTokenContract: ERC20;
    let rewardTokenContract: ERC20;
    let erc20Contract: ERC20;
    let lpTokenSymbol: string = "";
    before(async function () {
      erc20Contract = <ERC20>await hre.ethers.getContractAt(CONTRACTS.ERC20, tokens[0]);
      decimals = (await erc20Contract.decimals()).toString();

      lpTokenContract = <ERC20>await hre.ethers.getContractAt(CONTRACTS.ERC20, lpToken);
      lpTokenSymbol = await lpTokenContract.symbol();

      lendingProviderRegistry = <IAaveV3LendingPoolAddressesProviderRegistry>(
        await hre.ethers.getContractAt(CONTRACTS.IAaveV3endingPoolAddressesProviderRegistry, providerRegistryAddress)
      );
      incentiveContract = <IAaveV3RewardsController>(
        await hre.ethers.getContractAt(CONTRACTS.IAaveV3RewardsController, AaveIncentivesController.address)
      );

      const rewardsList = await incentiveContract.getRewardsList();
      if (rewardsList.length > 0) {
        rewardTokenContract = <ERC20>(
          await hre.ethers.getContractAt(CONTRACTS.ERC20, (await incentiveContract.getRewardsList())[0])
        );
      }
      lendingProvider = <IAaveV3LendingPoolAddressesProvider>(
        await hre.ethers.getContractAt(
          CONTRACTS.IAaveV3LendingPoolAddressesProvider,
          (
            await lendingProviderRegistry.getAddressesProvidersList()
          )[0],
        )
      );
      lendingPool = <IAaveV3>await hre.ethers.getContractAt(CONTRACTS.IAaveV3, await lendingProvider.getPool());

      await this.aaveV3Adapter.connect(this.signers.riskOperator).setMaxDepositPoolPct(providerRegistryAddress, 10000);
      await this.aaveV3Adapter.connect(this.signers.riskOperator).setMaxDepositProtocolMode(1);
    });
    it("1. setAaveAssetsList() should be only executed by Operator", async function () {
      await expect(
        this.aaveV3Adapter.connect(this.signers.alice).setAaveAssetsList([lpTokenContract.address]),
      ).to.be.revertedWith("caller is not the operator");
    });
    it("2. getUnderlyingTokens() should return correct underlying tokens", async function () {
      expect(await this.aaveV3Adapter.getUnderlyingTokens(hre.ethers.constants.AddressZero, lpToken)).to.have.members(
        tokens,
      );
    });
    it("3. getLiquidityPoolToken() should return a correct liquidity token", async function () {
      expect(await this.aaveV3Adapter.getLiquidityPoolToken(tokens[0], providerRegistryAddress)).to.be.eq(lpToken);
    });
    it("4. getSomeAmountInToken() should return correct amount", async function () {
      const amount = "1";
      expect(
        await this.aaveV3Adapter.getSomeAmountInToken(
          hre.ethers.constants.AddressZero,
          hre.ethers.constants.AddressZero,
          amount,
        ),
      ).to.be.eq(amount);
    });
    it("5. calculateAmountInLPToken() should return correct amount", async function () {
      const amount = "1";
      expect(
        await this.aaveV3Adapter.calculateAmountInLPToken(
          hre.ethers.constants.AddressZero,
          hre.ethers.constants.AddressZero,
          amount,
        ),
      ).to.be.eq(amount);
    });
    it("6. getPoolValue() should return correct pool value", async function () {
      expect(await this.aaveV3Adapter.getPoolValue(providerRegistryAddress, erc20Contract.address)).to.be.eq(
        await erc20Contract.balanceOf(
          await this.aaveV3Adapter.getLiquidityPoolToken(erc20Contract.address, lendingProviderRegistry.address),
        ),
      );
    });
    it("7. canStake() should return false", async function () {
      expect(await this.aaveV3Adapter.canStake(hre.ethers.constants.AddressZero)).to.be.eq(false);
    });
    it("8. getRewardToken() should return correct reward token", async function () {
      const rewardsList = await incentiveContract.getRewardsList();
      expect(await this.aaveV3Adapter.getRewardToken(hre.ethers.constants.AddressZero)).to.be.eq(
        rewardsList.length > 0 ? rewardsList[0] : hre.ethers.constants.AddressZero,
      );
    });
    it("9. getDepositSomeCodes() should return correct code", async function () {
      const amount = hre.ethers.utils.parseUnits("1", decimals);
      const codes = await this.aaveV3Adapter.getDepositSomeCodes(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
        amount,
      );
      checkDepositCode(codes, tokens[0], lendingPool.address, this.testDeFiAdapter.address, amount);
    });
    it("10. getDepositAllCodes() should return correct code", async function () {
      await setTokenBalanceInStorage(erc20Contract, this.testDeFiAdapter.address, "10");
      const amount = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const codes = await this.aaveV3Adapter.getDepositAllCodes(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
      );
      checkDepositCode(codes, tokens[0], lendingPool.address, this.testDeFiAdapter.address, amount);
    });
    it(`11. Deposit 10 ${token.toUpperCase()}`, async function () {
      await setTokenBalanceInStorage(erc20Contract, this.testDeFiAdapter.address, "10");
      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const previousLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      await this.testDeFiAdapter.testGetDepositSomeCodes(
        erc20Contract.address,
        providerRegistryAddress,
        this.aaveV3Adapter.address,
        previousBalance,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);
      expect(currentLpTokenBalance).to.gt(previousLpTokenBalance);
      expect(currentBalance).to.lt(previousBalance);
    });
    it(`12. getLiquidityPoolTokenBalance() should return correct balance after depositing`, async function () {
      expect(
        await this.aaveV3Adapter.getLiquidityPoolTokenBalance(
          this.testDeFiAdapter.address,
          erc20Contract.address,
          providerRegistryAddress,
        ),
      ).to.eq(await lpTokenContract.balanceOf(this.testDeFiAdapter.address));
    });
    it(`13. getAllAmountInToken() should return correct balance after depositing`, async function () {
      expect(
        await this.aaveV3Adapter.getAllAmountInToken(
          this.testDeFiAdapter.address,
          erc20Contract.address,
          providerRegistryAddress,
        ),
      ).to.eq(await lpTokenContract.balanceOf(this.testDeFiAdapter.address));
    });
    it(`14. isRedeemableAmountSufficient() should return true if balanceInToken >= redeemAmount`, async function () {
      expect(
        await this.aaveV3Adapter.isRedeemableAmountSufficient(
          this.testDeFiAdapter.address,
          erc20Contract.address,
          providerRegistryAddress,
          await lpTokenContract.balanceOf(this.testDeFiAdapter.address),
        ),
      ).to.eq(true);
    });
    it(`15. Only RiskOperator can execute setMaxDepositProtocolMode from pct to amt and set 2 ${token.toUpperCase()} as the max deposit amount`, async function () {
      await this.aaveV3Adapter.connect(this.signers.riskOperator).setMaxDepositProtocolMode(0);
      expect(await this.aaveV3Adapter.maxDepositProtocolMode()).to.eq(0);
      const amount = hre.ethers.utils.parseUnits("2", decimals);
      await this.aaveV3Adapter
        .connect(this.signers.riskOperator)
        .setMaxDepositAmount(providerRegistryAddress, erc20Contract.address, amount);
      expect(await this.aaveV3Adapter.maxDepositAmount(providerRegistryAddress, erc20Contract.address)).to.eq(amount);

      await expect(this.aaveV3Adapter.connect(this.signers.alice).setMaxDepositProtocolMode(0)).to.be.revertedWith(
        "caller is not the riskOperator",
      );
      await expect(
        this.aaveV3Adapter
          .connect(this.signers.alice)
          .setMaxDepositAmount(providerRegistryAddress, erc20Contract.address, amount),
      ).to.be.revertedWith("caller is not the riskOperator");
    });
    it(`16. Cannot deposit over the max deposit amount`, async function () {
      await setTokenBalanceInStorage(erc20Contract, this.testDeFiAdapter.address, "4");
      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const previousLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);
      const maxAmount = await this.aaveV3Adapter.maxDepositAmount(providerRegistryAddress, erc20Contract.address);
      await this.testDeFiAdapter.testGetDepositSomeCodes(
        erc20Contract.address,
        providerRegistryAddress,
        this.aaveV3Adapter.address,
        previousBalance,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      expect(currentLpTokenBalance).to.gt(previousLpTokenBalance);
      expect(currentBalance).to.eq(previousBalance.sub(maxAmount));
    });
    it(`17. Only RiskOperator can execute setMaxDepositProtocolMode from amt to pct and set 0.1% protocol investment limit`, async function () {
      await this.aaveV3Adapter.connect(this.signers.riskOperator).setMaxDepositPoolPct(providerRegistryAddress, 0);

      await this.aaveV3Adapter.connect(this.signers.riskOperator).setMaxDepositProtocolMode(1);
      expect(await this.aaveV3Adapter.maxDepositProtocolMode()).to.eq(1);
      const pct = 10;
      await this.aaveV3Adapter.connect(this.signers.riskOperator).setMaxDepositProtocolPct(pct);
      expect(await this.aaveV3Adapter.maxDepositProtocolPct()).to.eq(pct);

      await expect(this.aaveV3Adapter.connect(this.signers.alice).setMaxDepositProtocolMode(1)).to.be.revertedWith(
        "caller is not the riskOperator",
      );
      await expect(this.aaveV3Adapter.connect(this.signers.alice).setMaxDepositProtocolPct(pct)).to.be.revertedWith(
        "caller is not the riskOperator",
      );
    });
    it(`18. Cannot deposit over 0.1% pool value`, async function () {
      const poolValue = await this.aaveV3Adapter.getPoolValue(providerRegistryAddress, erc20Contract.address);
      const caculatedAmount = poolValue.mul(1).div(1000);
      await setTokenBalanceInStorage(
        erc20Contract,
        this.testDeFiAdapter.address,
        hre.ethers.utils.formatUnits(caculatedAmount.mul(2), decimals),
      );

      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);

      const previousLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);
      await this.testDeFiAdapter.testGetDepositSomeCodes(
        erc20Contract.address,
        providerRegistryAddress,
        this.aaveV3Adapter.address,
        previousBalance,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      expect(currentLpTokenBalance).to.gt(previousLpTokenBalance);
      expect(currentBalance).to.eq(previousBalance.sub(caculatedAmount));

      await moveToBlockAfterSeconds(hre, 10000);
    });
    it(`19. Only RiskOperator can set 0.12% pool investment limit`, async function () {
      const pct = 12;
      await this.aaveV3Adapter.connect(this.signers.riskOperator).setMaxDepositPoolPct(providerRegistryAddress, pct);
      expect(await this.aaveV3Adapter.maxDepositPoolPct(providerRegistryAddress)).to.eq(pct);
      await expect(
        this.aaveV3Adapter.connect(this.signers.alice).setMaxDepositPoolPct(providerRegistryAddress, pct),
      ).to.be.revertedWith("caller is not the riskOperator");
    });
    it(`20. Cannot deposit over 0.12% pool value (use maxDepositPoolPct if maxDepositPoolPct > 0)`, async function () {
      const poolValue = await this.aaveV3Adapter.getPoolValue(providerRegistryAddress, erc20Contract.address);
      const caculatedAmount = poolValue.mul(12).div(10000);
      await setTokenBalanceInStorage(
        erc20Contract,
        this.testDeFiAdapter.address,
        hre.ethers.utils.formatUnits(caculatedAmount.mul(2), decimals),
      );

      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const previousLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);
      await this.testDeFiAdapter.testGetDepositSomeCodes(
        erc20Contract.address,
        providerRegistryAddress,
        this.aaveV3Adapter.address,
        previousBalance,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      expect(currentLpTokenBalance).to.gt(previousLpTokenBalance);
      expect(currentBalance).to.eq(previousBalance.sub(caculatedAmount));

      await moveToBlockAfterSeconds(hre, 10000);
    });
    it("21. getWithdrawSomeCodes() should return correct code", async function () {
      const amount = hre.ethers.utils.parseUnits("1", decimals);
      const codes = await this.aaveV3Adapter.getWithdrawSomeCodes(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
        amount,
      );
      checkWithdrawCode(codes, lpToken, tokens[0], lendingPool.address, this.testDeFiAdapter.address, amount);
    });
    it("22. getWithdrawAllCodes() should return correct code", async function () {
      const amount = await this.aaveV3Adapter.getLiquidityPoolTokenBalance(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
      );
      const codes = await this.aaveV3Adapter.getWithdrawAllCodes(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
      );
      checkWithdrawCode(codes, lpToken, tokens[0], lendingPool.address, this.testDeFiAdapter.address, amount);
    });
    it(`23. Withdraw all available ${lpTokenSymbol}`, async function () {
      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const previousLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);
      await this.testDeFiAdapter.testGetWithdrawAllCodes(
        erc20Contract.address,
        providerRegistryAddress,
        this.aaveV3Adapter.address,
      );
      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);
      expect(currentLpTokenBalance).to.lt(previousLpTokenBalance);
      expect(currentBalance).to.gt(previousBalance);
      await moveToBlockAfterSeconds(hre, 1000000);
    });
    it(`24. getUnclaimedRewardTokenAmount() should return correct amount`, async function () {
      expect(
        await incentiveContract.getUserRewards(
          [lpTokenContract.address],
          this.testDeFiAdapter.address,
          hre.ethers.constants.AddressZero,
        ),
      ).to.be.eq(
        await this.aaveV3Adapter.getUnclaimedRewardTokenAmount(
          this.testDeFiAdapter.address,
          hre.ethers.constants.AddressZero,
          hre.ethers.constants.AddressZero,
        ),
      );
    });
    it(`25. getUnclaimedRewardTokensAmount() should return correct amount`, async function () {
      if (!rewardTokenContract) {
        this.skip();
      }
      const expectedResult = await incentiveContract.getAllUserRewards(
        [lpTokenContract.address],
        this.testDeFiAdapter.address,
      );
      const result = await this.aaveV3Adapter.getUnclaimedRewardTokensAmount(this.testDeFiAdapter.address);
      expect(expectedResult[0]).to.eql(result.rewardsList);
      expect(expectedResult[1]).to.eql(result.unclaimedAmounts);
    });
    it(`26. Claim all reward token`, async function () {
      if (!rewardTokenContract) {
        this.skip();
      }
      if ((await incentiveContract.getAssetDecimals(lpTokenContract.address)) > 0) {
        const previousBalance = await rewardTokenContract.balanceOf(this.testDeFiAdapter.address);

        await this.testDeFiAdapter.testClaimRewardTokenCode(lpTokenContract.address, this.aaveV3Adapter.address);

        const currentBalance = await rewardTokenContract.balanceOf(this.testDeFiAdapter.address);

        expect(currentBalance).to.gt(previousBalance);
      }
    });
    it(`27. Harvest all reward token`, async function () {
      if (!rewardTokenContract) {
        this.skip();
      }
      if ((await incentiveContract.getAssetDecimals(lpTokenContract.address)) > 0) {
        if (erc20Contract.address === rewardTokenContract.address) {
          this.skip();
        }
        const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);

        await this.testDeFiAdapter.testGetHarvestAllCodes(
          hre.ethers.constants.AddressZero,
          erc20Contract.address,
          this.aaveV3Adapter.address,
        );

        const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);

        expect(currentBalance).to.gt(previousBalance);
      }
    });
  });
}

export function checkDepositCode(
  codes: string[],
  token: string,
  lendingPool: string,
  account: string,
  amount: BigNumber,
) {
  for (let i = 0; i < codes.length; i++) {
    if (i < 2) {
      const inter = new hre.ethers.utils.Interface(["function approve(address,uint256)"]);
      const [address, abiCode] = hre.ethers.utils.defaultAbiCoder.decode(["address", "bytes"], codes[i]);
      expect(address).to.equal(token);
      const value = inter.decodeFunctionData("approve", abiCode);
      expect(value[0]).to.equal(lendingPool);
      expect(value[1]).to.equal(i === 0 ? 0 : amount);
    } else {
      const inter = new hre.ethers.utils.Interface(["function supply(address,uint256,address,uint16)"]);
      const [address, abiCode] = hre.ethers.utils.defaultAbiCoder.decode(["address", "bytes"], codes[i]);
      expect(address).to.equal(lendingPool);
      const value = inter.decodeFunctionData("supply", abiCode);
      expect(value[0]).to.equal(token);
      expect(value[1]).to.equal(amount);
      expect(value[2]).to.equal(account);
      expect(value[3]).to.equal(0);
    }
  }
}

export function checkWithdrawCode(
  codes: string[],
  lpToken: string,
  token: string,
  lendingPool: string,
  account: string,
  amount: BigNumber,
) {
  for (let i = 0; i < codes.length; i++) {
    if (i < 2) {
      const inter = new hre.ethers.utils.Interface(["function approve(address,uint256)"]);
      const [address, abiCode] = hre.ethers.utils.defaultAbiCoder.decode(["address", "bytes"], codes[i]);
      expect(address).to.equal(lpToken);
      const value = inter.decodeFunctionData("approve", abiCode);
      expect(value[0]).to.equal(lendingPool);
      expect(value[1]).to.equal(i === 0 ? 0 : amount);
    } else {
      const inter = new hre.ethers.utils.Interface(["function withdraw(address,uint256,address)"]);
      const [address, abiCode] = hre.ethers.utils.defaultAbiCoder.decode(["address", "bytes"], codes[i]);
      expect(address).to.equal(lendingPool);
      const value = inter.decodeFunctionData("withdraw", abiCode);
      expect(value[0]).to.equal(token);
      expect(value[1]).to.equal(amount);
      expect(value[2]).to.equal(account);
    }
  }
}
