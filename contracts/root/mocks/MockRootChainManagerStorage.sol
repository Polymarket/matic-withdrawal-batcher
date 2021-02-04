pragma solidity 0.6.8;

import {IStateSender} from "../interfaces/IStateSender.sol";
import {ICheckpointManager} from "../interfaces/ICheckpointManager.sol";

abstract contract RootChainManagerStorage {
    mapping(bytes32 => address) public typeToPredicate;
    mapping(address => address) public rootToChildToken;
    mapping(address => address) public childToRootToken;
    mapping(address => bytes32) public tokenToType;
    mapping(bytes32 => bool) public processedExits;
    IStateSender internal _stateSender;
    ICheckpointManager internal _checkpointManager;
    address public childChainManagerAddress;
}