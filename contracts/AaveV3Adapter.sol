// SPDX-License-Identifier:MIT

pragma solidity =0.8.11;
pragma experimental ABIEncoderV2;

//  libraries
import { Address } from "@openzeppelin/contracts-0.8.x/utils/Address.sol";
import { ERC20 } from "@openzeppelin/contracts-0.8.x/token/ERC20/ERC20.sol";

//  helper contracts
import { AdapterModifiersBase } from "./utils/AdapterModifiersBase.sol";
import "./utils/AdapterInvestLimitBase.sol";

//  interfaces
import { IVault } from "./utils/interfaces/IVault.sol";

import {
    IAaveV3LendingPoolAddressesProvider
} from "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3LendingPoolAddressesProvider.sol";
import {
    IAaveV3LendingPoolAddressesProviderRegistry
} from "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3LendingPoolAddressesProviderRegistry.sol";
import { IAaveV3, ReserveData } from "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3.sol";
import { IAaveV3Token } from "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3Token.sol";
import {
    IAaveV3ProtocolDataProvider
} from "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3ProtocolDataProvider.sol";
import { IAaveV3RewardsController } from "@optyfi/defi-legos/polygon/aavev3/contracts/IAaveV3RewardsController.sol";
import { IAdapter } from "@optyfi/defi-legos/interfaces/defiAdapters/contracts/IAdapter.sol";
import { IAdapterHarvestReward } from "@optyfi/defi-legos/interfaces/defiAdapters/contracts/IAdapterHarvestReward.sol";
import { IAdapterHarvestReward } from "@optyfi/defi-legos/interfaces/defiAdapters/contracts/IAdapterHarvestReward.sol";
import "@optyfi/defi-legos/interfaces/defiAdapters/contracts/IAdapterInvestLimit.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

/**
 * @title Adapter for Aave V3 protocol
 * @author Opty.fi
 * @dev Abstraction layer to Aave's pools
 */
contract AaveV3Adapter is IAdapter, IAdapterHarvestReward, AdapterInvestLimitBase {
    using Address for address;

    /** @notice Aave's Data provider id */
    bytes32 public constant PROTOCOL_DATA_PROVIDER_ID =
        0x0100000000000000000000000000000000000000000000000000000000000000;

    /**
     * @notice QuickSwap contract address
     */
    address public constant quickSwapRouter = address(0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff);

    /**@notice PoS WMATIC */
    address public constant WMATIC = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);

    /**@notice incentivesController*/
    address public constant incentivesController = address(0x929EC64c34a17401F460460D4B9390518E5B473e);

    /* solhint-disable no-empty-blocks */
    constructor(address _registry) AdapterModifiersBase(_registry) {}

    /**
     * @inheritdoc IAdapter
     */
    function getRewardToken(address) public view override returns (address) {
        address[] memory rewardsList = IAaveV3RewardsController(incentivesController).getRewardsList();
        if (rewardsList.length > 0) {
            return rewardsList[0];
        }
        return address(0);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getLiquidityPoolToken(address _underlyingToken, address _liquidityPoolAddressProviderRegistry)
        public
        view
        override
        returns (address)
    {
        address _lendingPool = _getLendingPool(_liquidityPoolAddressProviderRegistry);
        ReserveData memory _reserveData = IAaveV3(_lendingPool).getReserveData(_underlyingToken);
        return _reserveData.aTokenAddress;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getAllAmountInToken(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPoolAddressProviderRegistry
    ) public view override returns (uint256) {
        return getLiquidityPoolTokenBalance(_vault, _underlyingToken, _liquidityPoolAddressProviderRegistry);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getLiquidityPoolTokenBalance(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPoolAddressProviderRegistry
    ) public view override returns (uint256) {
        return ERC20(getLiquidityPoolToken(_underlyingToken, _liquidityPoolAddressProviderRegistry)).balanceOf(_vault);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getPoolValue(address _liquidityPoolAddressProviderRegistry, address _underlyingToken)
        public
        view
        override
        returns (uint256)
    {
        return
            ERC20(_underlyingToken).balanceOf(
                getLiquidityPoolToken(_underlyingToken, _liquidityPoolAddressProviderRegistry)
            );
    }

    /**
     * @inheritdoc IAdapter
     */
    function getDepositSomeCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPoolAddressProviderRegistry,
        uint256 _amount
    ) public view override returns (bytes[] memory _codes) {
        uint256 _depositAmount =
            _getDepositAmount(
                _liquidityPoolAddressProviderRegistry,
                _underlyingToken,
                _amount,
                getPoolValue(_liquidityPoolAddressProviderRegistry, _underlyingToken)
            );
        if (_depositAmount > 0) {
            address _lendingPool = _getLendingPool(_liquidityPoolAddressProviderRegistry);
            _codes = new bytes[](3);
            _codes[0] = abi.encode(
                _underlyingToken,
                abi.encodeWithSignature("approve(address,uint256)", _lendingPool, uint256(0))
            );
            _codes[1] = abi.encode(
                _underlyingToken,
                abi.encodeWithSignature("approve(address,uint256)", _lendingPool, _depositAmount)
            );
            _codes[2] = abi.encode(
                _lendingPool,
                abi.encodeWithSignature(
                    "supply(address,uint256,address,uint16)",
                    _underlyingToken,
                    _depositAmount,
                    _vault,
                    uint16(0)
                )
            );
        }
    }

    /**
     * @inheritdoc IAdapter
     */
    function getWithdrawSomeCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPoolAddressProviderRegistry,
        uint256 _amount
    ) public view override returns (bytes[] memory _codes) {
        require(_amount > 0, "!amount");
        if (_amount > 0) {
            address _lendingPool = _getLendingPool(_liquidityPoolAddressProviderRegistry);
            address _liquidityPoolToken =
                getLiquidityPoolToken(_underlyingToken, _liquidityPoolAddressProviderRegistry);
            _codes = new bytes[](3);
            _codes[0] = abi.encode(
                _liquidityPoolToken,
                abi.encodeWithSignature("approve(address,uint256)", _lendingPool, uint256(0))
            );
            _codes[1] = abi.encode(
                _liquidityPoolToken,
                abi.encodeWithSignature("approve(address,uint256)", _lendingPool, _amount)
            );
            _codes[2] = abi.encode(
                _lendingPool,
                abi.encodeWithSignature("withdraw(address,uint256,address)", _underlyingToken, _amount, _vault)
            );
        }
    }

    /**
     * @inheritdoc IAdapterHarvestReward
     */
    function getHarvestSomeCodes(
        address payable _vault,
        address _underlyingToken,
        address,
        uint256 _rewardTokenAmount
    ) public view override returns (bytes[] memory _codes) {
        return _getHarvestCodes(_vault, getRewardToken(address(0)), _underlyingToken, _rewardTokenAmount);
    }

    /**
     * @inheritdoc IAdapterHarvestReward
     */
    function getUnclaimedRewardTokenAmount(
        address payable _vault,
        address _liquidityPoolAddressProviderRegistry,
        address
    ) public view override returns (uint256 _amount) {
        address underlyingToken = IVault(_vault).underlyingToken();
        address[] memory _assets = new address[](1);
        _assets[0] = getLiquidityPoolToken(underlyingToken, _liquidityPoolAddressProviderRegistry);

        return (
            IAaveV3RewardsController(incentivesController).getUserRewards(_assets, _vault, getRewardToken(address(0)))
        );
    }

    /**
     * @inheritdoc IAdapter
     */
    function getDepositAllCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPoolAddressProviderRegistry
    ) external view override returns (bytes[] memory) {
        uint256 _amount = ERC20(_underlyingToken).balanceOf(_vault);
        return getDepositSomeCodes(_vault, _underlyingToken, _liquidityPoolAddressProviderRegistry, _amount);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getWithdrawAllCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPoolAddressProviderRegistry
    ) external view override returns (bytes[] memory) {
        uint256 _redeemAmount =
            getLiquidityPoolTokenBalance(_vault, _underlyingToken, _liquidityPoolAddressProviderRegistry);
        return getWithdrawSomeCodes(_vault, _underlyingToken, _liquidityPoolAddressProviderRegistry, _redeemAmount);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getUnderlyingTokens(address, address _liquidityPoolToken)
        public
        view
        override
        returns (address[] memory _underlyingTokens)
    {
        _underlyingTokens = new address[](1);
        _underlyingTokens[0] = IAaveV3Token(_liquidityPoolToken).UNDERLYING_ASSET_ADDRESS();
    }

    /**
     * @inheritdoc IAdapter
     */
    function getSomeAmountInToken(
        address,
        address,
        uint256 _liquidityPoolTokenAmount
    ) external pure override returns (uint256) {
        return _liquidityPoolTokenAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function calculateAmountInLPToken(
        address,
        address,
        uint256 _underlyingTokenAmount
    ) external pure override returns (uint256) {
        return _underlyingTokenAmount;
    }

    /* solhint-disable no-unused-vars */
    /**
     * @inheritdoc IAdapter
     */
    function calculateRedeemableLPTokenAmount(
        address payable,
        address,
        address,
        uint256 _redeemAmount
    ) external pure override returns (uint256) {
        return _redeemAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function isRedeemableAmountSufficient(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPoolAddressProviderRegistry,
        uint256 _redeemAmount
    ) external view override returns (bool) {
        uint256 _balanceInToken = getAllAmountInToken(_vault, _underlyingToken, _liquidityPoolAddressProviderRegistry);
        return _balanceInToken >= _redeemAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function canStake(address) external pure override returns (bool) {
        return false;
    }

    /**
     * @inheritdoc IAdapterHarvestReward
     */
    function getClaimRewardTokenCode(address payable _vault, address _liquidityPoolAddressProviderRegistry)
        external
        view
        override
        returns (bytes[] memory _codes)
    {
        address underlyingToken = IVault(_vault).underlyingToken();
        address[] memory _assets = new address[](1);
        _assets[0] = getLiquidityPoolToken(underlyingToken, _liquidityPoolAddressProviderRegistry);
        _codes = new bytes[](1);
        _codes[0] = abi.encode(
            incentivesController,
            abi.encodeWithSignature("claimAllRewards(address[],address)", _assets, _vault)
        );
    }

    /*solhint-disable  no-empty-blocks*/
    /**
     * @inheritdoc IAdapterHarvestReward
     */
    function getAddLiquidityCodes(address payable _vault, address _underlyingToken)
        external
        view
        override
        returns (bytes[] memory _codes)
    {}

    /*solhint-enable  no-empty-blocks*/

    /**
     * @inheritdoc IAdapterHarvestReward
     */
    function getHarvestAllCodes(
        address payable _vault,
        address _underlyingToken,
        address
    ) external view override returns (bytes[] memory _codes) {
        uint256 _rewardTokenAmount = ERC20(getRewardToken(address(0))).balanceOf(_vault);
        return getHarvestSomeCodes(_vault, _underlyingToken, address(0), _rewardTokenAmount);
    }

    function _getLendingPool(address _lendingPoolAddressProviderRegistry) internal view returns (address) {
        return
            IAaveV3LendingPoolAddressesProvider(_getLendingPoolAddressProvider(_lendingPoolAddressProviderRegistry))
                .getPool();
    }

    function _getLendingPoolAddressProvider(address _liquidityPoolAddressProviderRegistry)
        internal
        view
        returns (address)
    {
        return
            IAaveV3LendingPoolAddressesProviderRegistry(_liquidityPoolAddressProviderRegistry)
                .getAddressesProvidersList()[0];
    }

    /**
     * @dev Get the codes for harvesting the tokens using quickswap like routers-i.e. swapping back into the underlying
     * @param _vault Vault contract address
     * @param _rewardToken Reward token address
     * @param _underlyingToken Token address acting as underlying Asset for the vault contract
     * @param _rewardTokenAmount reward token amount to harvest
     * @return _codes List of harvest codes for harvesting reward tokens
     */
    function _getHarvestCodes(
        address payable _vault,
        address _rewardToken,
        address _underlyingToken,
        uint256 _rewardTokenAmount
    ) internal view returns (bytes[] memory _codes) {
        if (_rewardTokenAmount > 0) {
            uint256[] memory _amounts =
                IUniswapV2Router02(quickSwapRouter).getAmountsOut(
                    _rewardTokenAmount,
                    _getPath(_rewardToken, _underlyingToken)
                );
            if (_amounts[_amounts.length - 1] > 0) {
                _codes = new bytes[](3);
                _codes[0] = abi.encode(
                    _rewardToken,
                    abi.encodeCall(ERC20(_rewardToken).approve, (quickSwapRouter, uint256(0)))
                );
                _codes[1] = abi.encode(
                    _rewardToken,
                    abi.encodeCall(ERC20(_rewardToken).approve, (quickSwapRouter, _rewardTokenAmount))
                );
                _codes[2] = abi.encode(
                    quickSwapRouter,
                    abi.encodeCall(
                        IUniswapV2Router01(quickSwapRouter).swapExactTokensForTokens,
                        (
                            _rewardTokenAmount,
                            uint256(0),
                            _getPath(_rewardToken, _underlyingToken),
                            _vault,
                            type(uint256).max
                        )
                    )
                );
            }
        }
    }

    /**
     * @dev Constructs the path for token swap on Uniswap
     * @param _initialToken The token to be swapped with
     * @param _finalToken The token to be swapped for
     * @return _path The array of tokens in the sequence to be swapped for
     */
    function _getPath(address _initialToken, address _finalToken) internal pure returns (address[] memory _path) {
        if (_finalToken == WMATIC) {
            _path = new address[](2);
            _path[0] = _initialToken;
            _path[1] = WMATIC;
        } else if (_initialToken == WMATIC) {
            _path = new address[](2);
            _path[0] = WMATIC;
            _path[1] = _finalToken;
        } else {
            _path = new address[](3);
            _path[0] = _initialToken;
            _path[1] = WMATIC;
            _path[2] = _finalToken;
        }
    }
}
