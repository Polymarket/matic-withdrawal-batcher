// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.8;

contract Initializable {
    bool inited = false;

    modifier initializer() {
        require(!inited, "already inited");
        _;
        inited = true;
    }
}