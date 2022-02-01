import { PoolItem } from "./types";
import hre from "hardhat";
import { BigNumber } from "ethers";
import {
  IAaveLendingPoolAddressesProvider,
  IAaveLendingPoolAddressesProviderRegistry,
  IAaveProtocolDataProvider,
  IAaveIncentivesController,
  IAave,
  ERC20,
} from "../typechain";
import { AaveIncentivesController } from "@optyfi/defi-legos/polygon/aave";
import { expect } from "chai";
import { setTokenBalanceInStorage, moveToBlockAfterSeconds } from "./utils";
export function shouldBeHaveLikeAaveAdapter(token: string, pool: PoolItem): void {
  describe(`${token}, pool address : ${pool.pool}, lpToken address: ${pool.lpToken}`, async function () {
    let decimals: string;
    const { tokens, pool: providerRegistryAddress, lpToken } = pool;
    let lendingProviderRegistry: IAaveLendingPoolAddressesProviderRegistry;
    let lendingProvider: IAaveLendingPoolAddressesProvider;
    let protocolDataProvider: IAaveProtocolDataProvider;
    let lendingPool: IAave;
    let incentiveContract: IAaveIncentivesController;
    let lpTokenContract: ERC20;
    let rewardTokenContract: ERC20;
    let erc20Contract: ERC20;
    let lpTokenSymbol: string = "";
    before(async function () {
      erc20Contract = await hre.ethers.getContractAt("ERC20", tokens[0]);
      decimals = (await erc20Contract.decimals()).toString();

      lpTokenContract = await hre.ethers.getContractAt("ERC20", lpToken);
      lpTokenSymbol = await lpTokenContract.symbol();

      lendingProviderRegistry = await hre.ethers.getContractAt(
        "IAaveLendingPoolAddressesProviderRegistry",
        providerRegistryAddress,
      );

      incentiveContract = await hre.ethers.getContractAt("IAaveIncentivesController", AaveIncentivesController.address);

      rewardTokenContract = await hre.ethers.getContractAt("ERC20", await incentiveContract.REWARD_TOKEN());

      lendingProvider = await hre.ethers.getContractAt(
        "IAaveLendingPoolAddressesProvider",
        (
          await lendingProviderRegistry.getAddressesProvidersList()
        )[0],
      );
      protocolDataProvider = await hre.ethers.getContractAt(
        "IAaveProtocolDataProvider",
        await lendingProvider.getAddress("0x0100000000000000000000000000000000000000000000000000000000000000"),
      );
      lendingPool = await hre.ethers.getContractAt("IAave", await lendingProvider.getLendingPool());
    });
    it("1. getUnderlyingTokens() should return correct underlying tokens", async function () {
      expect(await this.aaveAdapter.getUnderlyingTokens(hre.ethers.constants.AddressZero, lpToken)).to.have.members(
        tokens,
      );
    });
    it("2. getLiquidityPoolToken() should return a correct liquidity token", async function () {
      expect(await this.aaveAdapter.getLiquidityPoolToken(tokens[0], providerRegistryAddress)).to.be.eq(lpToken);
    });
    it("3. getSomeAmountInToken() should return correct amount", async function () {
      const amount = "1";
      expect(
        await this.aaveAdapter.getSomeAmountInToken(
          hre.ethers.constants.AddressZero,
          hre.ethers.constants.AddressZero,
          amount,
        ),
      ).to.be.eq(amount);
    });
    it("4. calculateAmountInLPToken() should return correct amount", async function () {
      const amount = "1";
      expect(
        await this.aaveAdapter.calculateAmountInLPToken(
          hre.ethers.constants.AddressZero,
          hre.ethers.constants.AddressZero,
          amount,
        ),
      ).to.be.eq(amount);
    });
    it("5. getPoolValue() should return correct pool value", async function () {
      expect(await this.aaveAdapter.getPoolValue(providerRegistryAddress, erc20Contract.address)).to.be.eq(
        (await protocolDataProvider.getReserveData(erc20Contract.address)).availableLiquidity,
      );
    });
    it("6. canStake() should return false", async function () {
      expect(await this.aaveAdapter.canStake(hre.ethers.constants.AddressZero)).to.be.eq(false);
    });
    it("7. getRewardToken() should return zero address", async function () {
      expect(await this.aaveAdapter.getRewardToken(hre.ethers.constants.AddressZero)).to.be.eq(
        await incentiveContract.REWARD_TOKEN(),
      );
    });
    it("8. getDepositSomeCodes() should return correct code", async function () {
      const amount = hre.ethers.utils.parseUnits("1", decimals);
      const codes = await this.aaveAdapter.getDepositSomeCodes(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
        amount,
      );
      checkDepositCode(codes, tokens[0], lendingPool.address, this.testDeFiAdapter.address, amount);
    });
    it("9. getDepositAllCodes() should return correct code", async function () {
      const amount = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const codes = await this.aaveAdapter.getDepositAllCodes(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
      );
      checkDepositCode(codes, tokens[0], lendingPool.address, this.testDeFiAdapter.address, amount);
    });
    it("10. getWithdrawSomeCodes() should return correct code", async function () {
      const amount = hre.ethers.utils.parseUnits("1", decimals);
      const codes = await this.aaveAdapter.getWithdrawSomeCodes(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
        amount,
      );
      checkWithdrawCode(codes, lpToken, tokens[0], lendingPool.address, this.testDeFiAdapter.address, amount);
    });
    it("11. getWithdrawAllCodes() should return correct code", async function () {
      const amount = await this.aaveAdapter.getLiquidityPoolTokenBalance(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
      );
      const codes = await this.aaveAdapter.getWithdrawAllCodes(
        this.testDeFiAdapter.address,
        tokens[0],
        providerRegistryAddress,
      );
      checkWithdrawCode(codes, lpToken, tokens[0], lendingPool.address, this.testDeFiAdapter.address, amount);
    });
    it(`12. Deposit 10 ${token.toUpperCase()}`, async function () {
      await setTokenBalanceInStorage(erc20Contract, this.testDeFiAdapter.address, "10");
      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const previousLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      await this.testDeFiAdapter.testGetDepositSomeCodes(
        erc20Contract.address,
        providerRegistryAddress,
        this.aaveAdapter.address,
        previousBalance,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);
      expect(currentLpTokenBalance).to.gt(previousLpTokenBalance);
      expect(currentBalance).to.lt(previousBalance);
    });
    it(`13. getLiquidityPoolTokenBalance() should return correct balance after depositing`, async function () {
      expect(
        await this.aaveAdapter.getLiquidityPoolTokenBalance(
          this.testDeFiAdapter.address,
          erc20Contract.address,
          providerRegistryAddress,
        ),
      ).to.eq(await lpTokenContract.balanceOf(this.testDeFiAdapter.address));
    });
    it(`14. getAllAmountInToken() should return correct balance after depositing`, async function () {
      expect(
        await this.aaveAdapter.getAllAmountInToken(
          this.testDeFiAdapter.address,
          erc20Contract.address,
          providerRegistryAddress,
        ),
      ).to.eq(await lpTokenContract.balanceOf(this.testDeFiAdapter.address));
    });
    it(`15. isRedeemableAmountSufficient() should return true if balanceInToken >= redeemAmount`, async function () {
      expect(
        await this.aaveAdapter.isRedeemableAmountSufficient(
          this.testDeFiAdapter.address,
          erc20Contract.address,
          providerRegistryAddress,
          await lpTokenContract.balanceOf(this.testDeFiAdapter.address),
        ),
      ).to.eq(true);
    });
    it(`16. Only RiskOperator can execute setMaxDepositProtocolMode from pct to amt and set 2 ${token.toUpperCase()} as the max deposit amount`, async function () {
      await this.aaveAdapter.connect(this.signers.riskOperator).setMaxDepositProtocolMode(0);
      expect(await this.aaveAdapter.maxDepositProtocolMode()).to.eq(0);
      const amount = hre.ethers.utils.parseUnits("2", decimals);
      await this.aaveAdapter
        .connect(this.signers.riskOperator)
        .setMaxDepositAmount(providerRegistryAddress, erc20Contract.address, amount);
      expect(await this.aaveAdapter.maxDepositAmount(providerRegistryAddress, erc20Contract.address)).to.eq(amount);

      await expect(this.aaveAdapter.connect(this.signers.alice).setMaxDepositProtocolMode(0)).to.be.revertedWith(
        "caller is not the riskOperator",
      );
      await expect(
        this.aaveAdapter
          .connect(this.signers.alice)
          .setMaxDepositAmount(providerRegistryAddress, erc20Contract.address, amount),
      ).to.be.revertedWith("caller is not the riskOperator");
    });
    it(`17. Cannot deposit over the max deposit amount`, async function () {
      await setTokenBalanceInStorage(erc20Contract, this.testDeFiAdapter.address, "4");
      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const previousLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);
      const maxAmount = await this.aaveAdapter.maxDepositAmount(providerRegistryAddress, erc20Contract.address);
      await this.testDeFiAdapter.testGetDepositSomeCodes(
        erc20Contract.address,
        providerRegistryAddress,
        this.aaveAdapter.address,
        previousBalance,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      expect(currentLpTokenBalance).to.gt(previousLpTokenBalance);
      expect(currentBalance).to.eq(previousBalance.sub(maxAmount));
    });
    it(`18. Only RiskOperator can execute setMaxDepositProtocolMode from amt to pct and set 0.1% protocol investment limit`, async function () {
      await this.aaveAdapter.connect(this.signers.riskOperator).setMaxDepositPoolPct(providerRegistryAddress, 0);

      await this.aaveAdapter.connect(this.signers.riskOperator).setMaxDepositProtocolMode(1);
      expect(await this.aaveAdapter.maxDepositProtocolMode()).to.eq(1);
      const pct = 10;
      await this.aaveAdapter.connect(this.signers.riskOperator).setMaxDepositProtocolPct(pct);
      expect(await this.aaveAdapter.maxDepositProtocolPct()).to.eq(pct);

      await expect(this.aaveAdapter.connect(this.signers.alice).setMaxDepositProtocolMode(1)).to.be.revertedWith(
        "caller is not the riskOperator",
      );
      await expect(this.aaveAdapter.connect(this.signers.alice).setMaxDepositProtocolPct(pct)).to.be.revertedWith(
        "caller is not the riskOperator",
      );
    });
    it(`19. Cannot deposit over 0.1% pool value`, async function () {
      const poolValue = await this.aaveAdapter.getPoolValue(providerRegistryAddress, erc20Contract.address);
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
        this.aaveAdapter.address,
        previousBalance,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      expect(currentLpTokenBalance).to.gt(previousLpTokenBalance);
      expect(currentBalance).to.eq(previousBalance.sub(caculatedAmount));

      await moveToBlockAfterSeconds(hre, 10000);
    });
    it(`20. Only RiskOperator can set 0.12% pool investment limit`, async function () {
      const pct = 12;
      await this.aaveAdapter.connect(this.signers.riskOperator).setMaxDepositPoolPct(providerRegistryAddress, pct);
      expect(await this.aaveAdapter.maxDepositPoolPct(providerRegistryAddress)).to.eq(pct);
      await expect(
        this.aaveAdapter.connect(this.signers.alice).setMaxDepositPoolPct(providerRegistryAddress, pct),
      ).to.be.revertedWith("caller is not the riskOperator");
    });
    it(`21. Cannot deposit over 0.12% pool value (use maxDepositPoolPct if maxDepositPoolPct > 0)`, async function () {
      const poolValue = await this.aaveAdapter.getPoolValue(providerRegistryAddress, erc20Contract.address);
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
        this.aaveAdapter.address,
        previousBalance,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      expect(currentLpTokenBalance).to.gt(previousLpTokenBalance);
      expect(currentBalance).to.eq(previousBalance.sub(caculatedAmount));

      await moveToBlockAfterSeconds(hre, 10000);
    });
    it(`22. Withdraw all available ${lpTokenSymbol}`, async function () {
      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const previousLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      await this.testDeFiAdapter.testGetWithdrawAllCodes(
        erc20Contract.address,
        providerRegistryAddress,
        this.aaveAdapter.address,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);
      const currentLpTokenBalance = await lpTokenContract.balanceOf(this.testDeFiAdapter.address);

      expect(currentLpTokenBalance).to.lt(previousLpTokenBalance);
      expect(currentBalance).to.gt(previousBalance);

      await moveToBlockAfterSeconds(hre, 10000);
    });
    it(`23. getUnclaimedRewardTokenAmount() should return correct amount`, async function () {
      expect(await incentiveContract.getUserUnclaimedRewards(this.testDeFiAdapter.address)).to.be.eq(
        await this.aaveAdapter.getUnclaimedRewardTokenAmount(
          this.testDeFiAdapter.address,
          hre.ethers.constants.AddressZero,
          hre.ethers.constants.AddressZero,
        ),
      );
    });
    it(`24. Claim all reward token`, async function () {
      const previousBalance = await rewardTokenContract.balanceOf(this.testDeFiAdapter.address);

      await this.testDeFiAdapter.testClaimRewardTokenCode(providerRegistryAddress, this.aaveAdapter.address);

      const currentBalance = await rewardTokenContract.balanceOf(this.testDeFiAdapter.address);

      expect(currentBalance).to.gt(previousBalance);
    });
    it(`25. Harvest all reward token`, async function () {
      if (erc20Contract.address === rewardTokenContract.address) {
        this.skip();
      }
      const previousBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);

      await this.testDeFiAdapter.testGetHarvestAllCodes(
        hre.ethers.constants.AddressZero,
        erc20Contract.address,
        this.aaveAdapter.address,
      );

      const currentBalance = await erc20Contract.balanceOf(this.testDeFiAdapter.address);

      expect(currentBalance).to.gt(previousBalance);
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
      const inter = new hre.ethers.utils.Interface(["function deposit(address,uint256,address,uint16)"]);
      const [address, abiCode] = hre.ethers.utils.defaultAbiCoder.decode(["address", "bytes"], codes[i]);
      expect(address).to.equal(lendingPool);
      const value = inter.decodeFunctionData("deposit", abiCode);
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
