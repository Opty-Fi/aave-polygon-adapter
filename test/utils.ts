import { TransactionRequest } from "@ethersproject/providers";
import hre, { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ERC20 } from "../typechain";

export const CONTRACTS = {
  IAaveV2LendingPoolAddressesProviderRegistry:
    "@optyfi/defi-legos/polygon/aave/contracts/IAaveLendingPoolAddressesProviderRegistry.sol:IAaveLendingPoolAddressesProviderRegistry",
  IAaveV3endingPoolAddressesProviderRegistry:
    "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3LendingPoolAddressesProviderRegistry.sol:IAaveV3LendingPoolAddressesProviderRegistry",
  IAdapterRegistryBase: "IAdapterRegistryBase",
  TestDeFiAdapter: "TestDeFiAdapter",
  AaveAvaV2Adapter: "AaveAdapter",
  AaveV3Adapter: "AaveV3Adapter",
  ERC20: "ERC20",
  IAaveIncentivesController:
    "@optyfi/defi-legos/polygon/aave/contracts/IAaveIncentivesController.sol:IAaveIncentivesController",
  IAaveV2LendingPoolAddressesProvider:
    "@optyfi/defi-legos/polygon/aave/contracts/IAaveLendingPoolAddressesProvider.sol:IAaveLendingPoolAddressesProvider",
  IAaveV2ProtocolDataProvider:
    "@optyfi/defi-legos/polygon/aave/contracts/IAaveProtocolDataProvider.sol:IAaveProtocolDataProvider",
  IAaveV2: "@optyfi/defi-legos/polygon/aave/contracts/IAave.sol:IAave",
  IAaveV3RewardsController:
    "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3RewardsController.sol:IAaveV3RewardsController",
  IAaveV3LendingPoolAddressesProvider:
    "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3LendingPoolAddressesProvider.sol:IAaveV3LendingPoolAddressesProvider",
  IAaveV3ProtocolDataProvider:
    "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3ProtocolDataProvider.sol:IAaveV3ProtocolDataProvider",
  IAaveV3: "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3.sol:IAaveV3",
};

export function getOverrideOptions(): TransactionRequest {
  return {
    gasPrice: 1_000_000_00,
  };
}

const setStorageAt = (address: string, slot: string, val: string) =>
  hre.network.provider.send("hardhat_setStorageAt", [address, slot, val]);

const tokenBalancesSlot = async (token: ERC20) => {
  const val: string = "0x" + "12345".padStart(64, "0");
  const account: string = ethers.constants.AddressZero;

  for (let i = 0; i < 100; i++) {
    let slot = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, i]));
    while (slot.startsWith("0x0")) slot = "0x" + slot.slice(3);

    const prev = await hre.network.provider.send("eth_getStorageAt", [account, slot, "latest"]);
    await setStorageAt(token.address, slot, val);
    const balance = await token.balanceOf(account);
    await setStorageAt(token.address, slot, prev);
    if (balance.eq(ethers.BigNumber.from(val))) {
      return { index: i, isVyper: false };
    }
  }

  for (let i = 0; i < 100; i++) {
    let slot = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["uint256", "address"], [i, account]));
    while (slot.startsWith("0x0")) slot = "0x" + slot.slice(3);

    const prev = await hre.network.provider.send("eth_getStorageAt", [account, slot, "latest"]);
    await setStorageAt(token.address, slot, val);
    const balance = await token.balanceOf(account);
    await setStorageAt(token.address, slot, prev);
    if (balance.eq(ethers.BigNumber.from(val))) {
      return { index: i, isVyper: true };
    }
  }
  throw "balances slot not found!";
};

// Source : https://blog.euler.finance/brute-force-storage-layout-discovery-in-erc20-contracts-with-hardhat-7ff9342143ed
export async function setTokenBalanceInStorage(token: ERC20, account: string, amount: string) {
  const balancesSlot = await tokenBalancesSlot(token);
  if (balancesSlot.isVyper) {
    return setStorageAt(
      token.address,
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(["uint256", "address"], [balancesSlot.index, account]),
      ),
      "0x" +
        ethers.utils
          .parseUnits(amount, await token.decimals())
          .toHexString()
          .slice(2)
          .padStart(64, "0"),
    );
  } else {
    return setStorageAt(
      token.address,
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, balancesSlot.index]),
      ),
      "0x" +
        ethers.utils
          .parseUnits(amount, await token.decimals())
          .toHexString()
          .slice(2)
          .padStart(64, "0"),
    );
  }
}

export async function moveToNextBlock(hre: HardhatRuntimeEnvironment): Promise<void> {
  const blockNumber = await hre.ethers.provider.getBlockNumber();
  const block = await hre.ethers.provider.getBlock(blockNumber);
  await moveToSpecificBlock(hre, block.timestamp);
}

export async function moveToBlockAfterSeconds(hre: HardhatRuntimeEnvironment, seconds: number): Promise<void> {
  const blockNumber = await hre.ethers.provider.getBlockNumber();
  const block = await hre.ethers.provider.getBlock(blockNumber);
  await moveToSpecificBlock(hre, block.timestamp + seconds);
}

export async function moveToSpecificBlock(hre: HardhatRuntimeEnvironment, timestamp: number): Promise<void> {
  await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 1]);
  await hre.network.provider.send("evm_mine");
}
