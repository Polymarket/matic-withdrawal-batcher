// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/drafts/EIP712.sol";
import { RootWithdrawalBatcherTunnel } from "./RootWithdrawalBatcherTunnel.sol";
import { DepositEncoder } from "../common/DepositEncoder.sol";

contract RootWithdrawalBatcher is EIP712, RootWithdrawalBatcherTunnel {
    using DepositEncoder for bytes32;

    event Claim(address indexed balanceOwner, uint256 claimAmount);

    IERC20 public immutable withdrawalToken;

    mapping(address=>uint256) public balanceOf;
    mapping(address=>uint256) public claimNonce;

    bytes32 constant CLAIM_TYPEHASH = keccak256("Claim(address balanceOwner,address[] claimReceivers,uint256[] claimAmounts,bool[] internalClaims,uint256 nonce)");

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

        emit Claim(msg.sender, claimAmount);
    }

    /**
     * @notice Claim an address' balance, distributing their tokens to multiple addresses
     * @dev This allows for delegating claiming a withdrawal by incentivising another recipient to pay the gas instead
     * @param balanceOwner - the address of the owner of the funds which is being claimed
     * @param claimReceivers - an array of addresses which will receive a portion of the claimed funds
     * @param claimAmounts - an array of amounts of tokens to be distributed to each claimReceiver
     * @param internalClaims - an array of booleans representing whether the claimAmount should be sent to the claimReceiver's internal balance 
     * @param signature - a signature by the balanceOwner authorising this distribution
     */
    function claimFor(address balanceOwner, address[] calldata claimReceivers, uint256[] calldata claimAmounts, bool[] calldata internalClaims, bytes calldata signature) external {
        require(claimReceivers.length == claimAmounts.length, "Mismatched lengths of claim arrays");
        require(claimReceivers.length == internalClaims.length, "Mismatched lengths of claim arrays");


        // Ensure that balanceOwner authorised this claim
        if (msg.sender != balanceOwner){
            verifyClaimSignature(balanceOwner, claimReceivers, claimAmounts, internalClaims, signature);
        }

        // Calculate size of claim
        uint256 totalClaimAmount;
        for (uint256 i = 0; i < claimAmounts.length; i+=1){
            totalClaimAmount += claimAmounts[i];
        }

        // Enforce that claim does not exceed balanceOwner's balance
        uint256 balance = balanceOf[balanceOwner];
        balanceOf[balanceOwner] = balance - totalClaimAmount;
        require(balance >= totalClaimAmount, "Recipient balance not sufficient to cover claim");

        // Distribute funds through internal balance transfers or erc20 transfers
        for (uint256 i = 0; i < claimReceivers.length; i += 1){
            if (internalClaims[i]) {
                balanceOf[claimReceivers[i]] += claimAmounts[i];
            } else {
                require(withdrawalToken.transfer(claimReceivers[i], claimAmounts[i]), "Token transfer failed");
            }
        }

        emit Claim(balanceOwner, totalClaimAmount);
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
     * @notice verifies a signature by the balanceOwner authorising a claim on their funds
     * @param balanceOwner - the address of the owner of the funds which is being claimed
     * @param claimReceivers - an array of addresses which will receive a portion of the claimed funds
     * @param claimAmounts - an array of amounts of tokens to be distributed to each claimReceiver
     * @param internalClaims - an array of booleans representing whether the claimAmount should be sent to the claimReceiver's internal balance 
     * @param signature - a signature by the balanceOwner authorising this distribution
     */
    function verifyClaimSignature(address balanceOwner, address[] memory claimReceivers, uint256[] memory claimAmounts, bool[] memory internalClaims, bytes memory signature) private returns (bool) {
        uint256 currentNonce = claimNonce[balanceOwner];
        bytes32 digest = _hashTypedDataV4(keccak256(
            abi.encode(
                CLAIM_TYPEHASH,
                balanceOwner,
                keccak256(abi.encodePacked(claimReceivers)),
                keccak256(abi.encodePacked(claimAmounts)),
                keccak256(abi.encodePacked(internalClaims)),
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