// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

interface IStateSender {
    function syncState(address receiver, bytes calldata data) external;
}