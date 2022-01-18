// solhint-disable no-unused-vars
// SPDX-License-Identifier:MIT

pragma solidity =0.8.11;
pragma experimental ABIEncoderV2;

//  libraries
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

//  helper contracts
import { AdapterModifiersBase } from "./utils/AdapterModifiersBase.sol";
import "./utils/AdapterInvestLimitBase.sol";

//  interfaces
import {
    IAaveLendingPoolAddressesProvider
} from "@optyfi/defi-legos/polygon/aave/contracts/IAaveLendingPoolAddressesProvider.sol";
import {
    IAaveLendingPoolAddressesProviderRegistry
} from "@optyfi/defi-legos/polygon/aave/contracts/IAaveLendingPoolAddressesProviderRegistry.sol";
import { IAave, ReserveData } from "@optyfi/defi-legos/polygon/aave/contracts/IAave.sol";
import { IAToken } from "@optyfi/defi-legos/polygon/aave/contracts/IAToken.sol";
import {
    IAaveProtocolDataProvider,
    UserReserveData,
    ReserveDataProtocol,
    ReserveConfigurationData
} from "@optyfi/defi-legos/polygon/aave/contracts/IAaveProtocolDataProvider.sol";
import { IAdapter } from "@optyfi/defi-legos/interfaces/defiAdapters/contracts/IAdapter.sol";
import "@optyfi/defi-legos/interfaces/defiAdapters/contracts/IAdapterInvestLimit.sol";

/**
 * @title Adapter for AaveV2 protocol
 * @author Opty.fi
 * @dev Abstraction layer to AaveV2's pools
 */
contract AaveAdapter is IAdapter, AdapterInvestLimitBase {
    using SafeMath for uint256;
    using Address for address;

    /** @notice AaveV2's Data provider id */
    bytes32 public constant PROTOCOL_DATA_PROVIDER_ID =
        0x0100000000000000000000000000000000000000000000000000000000000000;

    /* solhint-disable no-empty-blocks */
    constructor(address _registry) public AdapterModifiersBase(_registry) {}

    /**
     * @inheritdoc IAdapter
     */
    function getDepositAllCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPoolAddressProviderRegistry
    ) public view override returns (bytes[] memory) {
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
    ) public view override returns (bytes[] memory) {
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
        _underlyingTokens[0] = IAToken(_liquidityPoolToken).UNDERLYING_ASSET_ADDRESS();
    }

    /**
     * @inheritdoc IAdapter
     */
    function getSomeAmountInToken(
        address,
        address,
        uint256 _liquidityPoolTokenAmount
    ) public view override returns (uint256) {
        return _liquidityPoolTokenAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function calculateAmountInLPToken(
        address,
        address,
        uint256 _underlyingTokenAmount
    ) public view override returns (uint256) {
        return _underlyingTokenAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function calculateRedeemableLPTokenAmount(
        address payable,
        address,
        address,
        uint256 _redeemAmount
    ) public view override returns (uint256) {
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
    ) public view override returns (bool) {
        uint256 _balanceInToken = getAllAmountInToken(_vault, _underlyingToken, _liquidityPoolAddressProviderRegistry);
        return _balanceInToken >= _redeemAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getRewardToken(address) public view override returns (address) {
        return address(0);
    }

    /**
     * @inheritdoc IAdapter
     */
    function canStake(address) public view override returns (bool) {
        return false;
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
        ReserveData memory _reserveData = IAave(_lendingPool).getReserveData(_underlyingToken);
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
        return _getReserveData(_liquidityPoolAddressProviderRegistry, _underlyingToken).availableLiquidity;
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
                    "deposit(address,uint256,address,uint16)",
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

    function _getLendingPool(address _lendingPoolAddressProviderRegistry) internal view returns (address) {
        return
            IAaveLendingPoolAddressesProvider(_getLendingPoolAddressProvider(_lendingPoolAddressProviderRegistry))
                .getLendingPool();
    }

    function _getReserveData(address _liquidityPoolAddressProviderRegistry, address _underlyingToken)
        internal
        view
        returns (ReserveDataProtocol memory)
    {
        return
            IAaveProtocolDataProvider(_getProtocolDataProvider(_liquidityPoolAddressProviderRegistry)).getReserveData(
                _underlyingToken
            );
    }

    function _getLendingPoolAddressProvider(address _liquidityPoolAddressProviderRegistry)
        internal
        view
        returns (address)
    {
        return
            IAaveLendingPoolAddressesProviderRegistry(_liquidityPoolAddressProviderRegistry)
                .getAddressesProvidersList()[0];
    }

    function _getProtocolDataProvider(address _liquidityPoolAddressProviderRegistry) internal view returns (address) {
        return
            IAaveLendingPoolAddressesProvider(_getLendingPoolAddressProvider(_liquidityPoolAddressProviderRegistry))
                .getAddress(PROTOCOL_DATA_PROVIDER_ID);
    }
}
