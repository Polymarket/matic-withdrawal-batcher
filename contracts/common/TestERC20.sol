// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor() ERC20("TestToken", "TEST") public {}

    function mint(uint256 amount) public returns (bool) {
        mint(msg.sender, amount);
    }

    function mint(address recipient, uint256 amount) public returns (bool) {
        _mint(recipient, amount);
        return true;
    }
}
