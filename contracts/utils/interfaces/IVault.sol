// SPDX-License-Identifier: MIT

pragma solidity >0.6.0 <0.9.0;

interface IVault {
    function underlyingToken() external view returns (address);
}
