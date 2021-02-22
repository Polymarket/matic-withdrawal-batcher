// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/drafts/EIP712.sol";
import { RootWithdrawalBatcherTunnel } from "./RootWithdrawalBatcherTunnel.sol";
import { DepositEncoder } from "../common/DepositEncoder.sol";

contract RootWithdrawalBatcher is EIP712, RootWithdrawalBatcherTunnel {
    using DepositEncoder for bytes32;

    event FundsClaimed(address indexed balanceOwner, uint256 claimAmount);

    IERC20 public immutable withdrawalToken;

    mapping(address=>uint256) public balanceOf;
    mapping(address=>uint256) public claimNonce;

    bytes32 constant CLAIM_TYPEHASH = keccak256("Claim(address recipient,uint256 amount,bool internalClaim)");
    bytes32 constant DISTRIBUTION_TYPEHASH = keccak256("ClaimDistribution(address balanceOwner,Claim[] claims,uint256 nonce)Claim(address recipient,uint256 amount,bool internalClaim)");

    struct Claim {
        address recipient;
        uint256 amount;
        bool internalClaim;
    }

    /**
     * @dev constructor argument _childTunnel is needed for testing. In a production deploy this should be set to zero
     *      RootWithdrawalBatcherTunnel will then only accept messages from the a contract on the child chain at the same address as itself
     * @param _withdrawalToken - ERC20 token which this contract distributes
     * @param _checkpointManager - Address of contract containing Matic validator checkpoints
     * @param _childTunnel - address of contract which this contract accepts messages from. Set to 0 in a production deploy.
     */
    constructor(IERC20 _withdrawalToken, address _checkpointManager, address _childTunnel)
        public
        EIP712("RootWithdrawalBatcher", "1")
        RootWithdrawalBatcherTunnel(_checkpointManager, _childTunnel)
    {
        withdrawalToken = _withdrawalToken;
    }

    /**
     * @notice Claim caller's balance, sending the tokens to their address
     */
    function claim() external {
        claim(balanceOf[msg.sender]);
    }

    /**
     * @notice Claim caller's balance, sending the tokens to their address
     */
    function claim(uint256 claimAmount) public {
        uint256 balance = balanceOf[msg.sender];
        balanceOf[msg.sender] = balance - claimAmount;
        require(balance >= claimAmount, "Balance not sufficient to cover claim");
        require(withdrawalToken.transfer(msg.sender, claimAmount), "Token transfer failed");

        emit FundsClaimed(msg.sender, claimAmount);
    }

    /**
     * @notice Claim an address' balance, distributing their tokens to multiple addresses
     * @dev This allows for delegating claiming a withdrawal by incentivising another recipient to pay the gas instead
     * @param balanceOwner - the address of the owner of the funds which is being claimed
     * @param claims - An array of claims describing how to distribute the balanceOwner's funds
     * @param signature - a signature by the balanceOwner authorising this distribution
     */
    function claimFor(address balanceOwner, Claim[] calldata claims, bytes calldata signature) external {

        // Ensure that balanceOwner authorised this claim
        if (msg.sender != balanceOwner){
            verifyClaimSignature(balanceOwner, claims, signature);
        }

        uint256 initialBalance = balanceOf[balanceOwner];
        uint256 balance = initialBalance;
        // Distribute funds
        for (uint256 i = 0; i < claims.length; i += 1){
            // Decrease balanceOwner's balance
            uint256 claimAmount = claims[i].amount;
            require(balance >= claimAmount, "balancerOwner's balance not sufficient to cover claim");
            balance -= claimAmount;
            
            // Send funds to claimReceiver
            if (claims[i].internalClaim) {
                // An internal claim to the balanceOwner will result in loss of funds
                require(claims[i].recipient != balanceOwner, "Can't perform internal transfer to balanceOwner");
                balanceOf[claims[i].recipient] += claimAmount;
            } else {
                require(withdrawalToken.transfer(claims[i].recipient, claimAmount), "Token transfer failed");
            }
        }
     
        balanceOf[balanceOwner] = balance;
        emit FundsClaimed(balanceOwner, initialBalance - balance);
    }

    /**
     * @notice Process message received from Child Tunnel
     * @dev function needs to be implemented to handle message as per requirement
     * This is called by onStateReceive function.
     * Since it is called via a system call, any event will not be emitted during its execution.
     * @param message bytes message that was sent from Child Tunnel
     */
    function _processMessageFromChild(bytes memory message) override internal {
        distributeWithdrawals(message);
    }

    /**
     * @notice Distribute a batch of withdrawals to its recipients
     * @param message bytes object of packed encoded deposits
     */
    function distributeWithdrawals(bytes memory message) private {
        for (uint256 i = 32; i <= message.length; i = i + 32){
            // Each 32 bytes of the message corresponds to an encoded deposit
            bytes32 encodedWithdrawal;
            assembly {
                encodedWithdrawal := mload(add(message, i))
            }

            // Decode and add to user's balance
            (address recipient, uint96 amount) = encodedWithdrawal.decodeDeposit();
            balanceOf[recipient] += amount;
        }
    }

    /**
     * @notice hashes an array of claims
     * @param claims - An array of claims describing how to distribute the balanceOwner's funds
     */
    function hashClaims(Claim[] memory claims) private returns (bytes32) {
        bytes32[] memory claimHashes = new bytes32[](claims.length);
        for (uint256 i = 0; i < claims.length; i += 1){
            Claim memory claim = claims[i];
            claimHashes[i] = keccak256(abi.encode(CLAIM_TYPEHASH, claim.recipient, claim.amount, claim.internalClaim));
        }
        return keccak256(abi.encodePacked(claimHashes));
    }

    /**
     * @notice verifies a signature by the balanceOwner authorising a claim on their funds
     * @param balanceOwner - the address of the owner of the funds which is being claimed
     * @param claims - An array of claims describing how to distribute the balanceOwner's funds
     * @param signature - a signature by the balanceOwner authorising this distribution
     */
    function verifyClaimSignature(address balanceOwner, Claim[] memory claims, bytes memory signature) private returns (bool) {
        uint256 currentNonce = claimNonce[balanceOwner];
        bytes32 digest = _hashTypedDataV4(keccak256(
            abi.encode(
                DISTRIBUTION_TYPEHASH,
                balanceOwner,
                hashClaims(claims),
                currentNonce
            )
        ));
        claimNonce[balanceOwner] = currentNonce + 1;
        require(balanceOwner == ECDSA.recover(digest, signature), "Invalid signature");
        return true;
    }

    /**
     * @notice increments a user's claimNonce to invalidate past signatures
     */
    function incrementNonce() external {
        claimNonce[msg.sender] += 1;
    }
}