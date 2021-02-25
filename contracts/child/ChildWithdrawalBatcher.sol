// SPDX-License-Identifier: MIT

pragma solidity 0.6.8;

import { ECDSA } from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/drafts/EIP712.sol";
import { AccessControlMixin } from "../common/Matic/AccessControlMixin.sol";
import { IChildERC20 } from "./interfaces/IChildERC20.sol";
import { ChildSendOnlyTunnel } from "./ChildSendOnlyTunnel.sol";
import { DepositEncoder } from "../common/DepositEncoder.sol";

contract ChildWithdrawalBatcher is EIP712, AccessControlMixin, ChildSendOnlyTunnel {
    using DepositEncoder for bytes32;

    event Deposit(address indexed depositor, address indexed recipient, uint256 amount);
    event Withdrawal(address indexed balanceOwner, address indexed withdrawalReceiver, uint256 amount);
    event BridgedWithdrawals(address indexed bridger, bytes32[] encodedDeposits, uint256 amount);

    bytes32 constant WITHDRAWAL_TYPEHASH = keccak256("Withdrawal(address balanceOwner,address withdrawalReceiver,uint256 amount,uint256 nonce)");

    IChildERC20 public immutable withdrawalToken;

    mapping(address => uint256) public balanceOf;
    mapping(address=>uint256) public withdrawalNonce;

    // Safety parameters to prevent malicious bridging
    uint256 public minBatchAmount;
    uint256 public minWithdrawalAmount;
    uint256 public maxWithdrawalRecipients;

    /**
     *
     * @param _withdrawalToken - ERC20 token which this contract is batching withdrawals for
     * @param _minBatchAmount - The minimum number of tokens which must be included in a batch of withdrawals
     * @param _minWithdrawalAmount - The minimum number of tokens which must be included in single withdrawal
     * @param _maxWithdrawalRecipients - The maximum number of recipients which can included in a single withdrawal
     */
    constructor(IChildERC20 _withdrawalToken, uint256 _minBatchAmount, uint256 _minWithdrawalAmount, uint256 _maxWithdrawalRecipients)
        public
        EIP712("ChildWithdrawalBatcher", "1")
    {
        _setupContractId("ChildWithdrawalBatcher");
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        withdrawalToken = _withdrawalToken;
        minBatchAmount = _minBatchAmount;
        minWithdrawalAmount = _minWithdrawalAmount;
        maxWithdrawalRecipients = _maxWithdrawalRecipients;
    }

    /**
     * Transfers user's funds to the contract to be included in a withdrawal, increasing their balance
     * @param amount - amount of funds to be deposited for recipient
     */
    function deposit(uint96 amount) public {
        depositFor(msg.sender, amount);
    }

    /**
     * Transfers user's funds to the contract to be included in a withdrawal to another account, increasing its balance
     * @param recipient - address on root chain which will be able to claim funds
     * @param amount - amount of funds to be deposited for recipient
     */
    function depositFor(address recipient, uint96 amount) public {
        require(withdrawalToken.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        
        balanceOf[recipient] += amount;
        emit Deposit(msg.sender, recipient, amount);
    }

    /**
     * Withdraws from user's internal balance back to their account on Matic
     * @param amount - amount of funds to be withdrawn for recipient
     */
    function withdraw(uint256 amount) external {
        withdrawFor(msg.sender, msg.sender, amount, "");
    }

    /**
     * Withdraws from user's internal balance back to their account on Matic
     * @param amount - amount of funds to be withdrawn for recipient
     */
    function withdrawFor(address balanceOwner, address withdrawalReceiver, uint256 amount, bytes memory signature) public {
        if (msg.sender != balanceOwner) {
            verifyWithdrawalSignature(balanceOwner, withdrawalReceiver, amount, signature);
        }

        uint256 userBalance = balanceOf[balanceOwner];
        
        require(userBalance >= amount, "Batcher: Insufficient balance for withdrawal");
        balanceOf[balanceOwner] =  userBalance - amount;
        
        require(withdrawalToken.transfer(withdrawalReceiver, amount), "Token transfer failed");
        emit Withdrawal(balanceOwner, withdrawalReceiver, amount);
    }

    /**
     * Bundles a number of user's balances into a single withdrawal from Matic
     * @dev Withdrawals are encoded by shifting the recipient address into the upper bytes of the bytes32 object.
     *      This leaves 12 bytes to store the withdrawal amount in the lower bits.
     *      e.g. A deposit of 100 (0x64) to the address 0xf35a15fa6dc1C11C8F242663fEa308Cd85688adA 
     *           results in 0xf35a15fa6dc1c11c8f242663fea308cd85688ada000000000000000000000064
     *
     *      This array is concatenated and passed to the RootWithdrawalBatcher on Ethereum to redistribute funds
     * @param encodedWithdrawals - an array of bytes32 objects which each represent a withdrawal to a recipient's account on Ethereum
     */
    function bridgeWithdrawals(bytes32[] calldata encodedWithdrawals) external {
        // Prevents exhausting gas limit on Ethereum by including many small withdrawals to different recipients
        require(encodedWithdrawals.length <= maxWithdrawalRecipients, "Batcher: Too many recipients included in batch");

        uint256 totalWithdrawalAmount;
        // Calculate amount of funds to be bridged for withdrawals
        for (uint256 i; i < encodedWithdrawals.length; i++){
            (address recipient, uint96 withdrawalAmount) = encodedWithdrawals[i].decodeDeposit();
            totalWithdrawalAmount += withdrawalAmount;

            
            // Enforce a minimum withdrawal amount 
            // This avoids batch processing costs being inflated due to zero value withdrawals being included
            require(withdrawalAmount >= minWithdrawalAmount, "Batcher: user withdrawal amount below minimum");
            
            // Enforce that full balance of recipient is used
            // This prevents attacks by malicious bridgers fragmenting users' funds over many withdrawals
            require(balanceOf[recipient] == withdrawalAmount, "Batcher: withdrawal size must match user's balance");
            balanceOf[recipient] = 0;
        }

        // Prevents gas costs of claiming withdrawals outweighing withdrawal value
        require(totalWithdrawalAmount >= minBatchAmount, "Batcher: Batch size below minimum amount");

        // Withdraw the amount of funds needed for newly processed withdrawals
        withdrawalToken.withdraw(totalWithdrawalAmount);

        // Send a message to contract on Ethereum to allow recipients to withdraw
        _sendMessageToRoot(abi.encodePacked(encodedWithdrawals));

        emit BridgedWithdrawals(msg.sender, encodedWithdrawals, totalWithdrawalAmount);
    }

    function setMinBatchAmount(uint256 _minBatchAmount) external only(DEFAULT_ADMIN_ROLE) {
        minBatchAmount = _minBatchAmount;
    }

    function setMinWithdrawalAmount(uint256 _minWithdrawalAmount) external only(DEFAULT_ADMIN_ROLE) {
        minWithdrawalAmount = _minWithdrawalAmount;
    }

    function setMaxWithdrawalRecipients(uint256 _maxWithdrawalRecipients) external only(DEFAULT_ADMIN_ROLE) {
        maxWithdrawalRecipients = _maxWithdrawalRecipients;
    }

    /**
     * @notice verifies a signature by the balanceOwner authorising a claim on their funds
     * @param balanceOwner - the address of the owner of the funds which is being claimed
     * @param signature - a signature by the balanceOwner authorising this distribution
     */
    function verifyWithdrawalSignature(address balanceOwner, address withdrawalReceiver, uint256 amount, bytes memory signature) private returns (bool) {
        uint256 currentNonce = withdrawalNonce[balanceOwner];
        bytes32 digest = _hashTypedDataV4(keccak256(
            abi.encode(
                WITHDRAWAL_TYPEHASH,
                balanceOwner,
                withdrawalReceiver,
                amount,
                currentNonce
            )
        ));
        withdrawalNonce[balanceOwner] = currentNonce + 1;
        require(balanceOwner == ECDSA.recover(digest, signature), "Batcher: withdrawal not signed by balanceOwner");
        return true;
    }
}