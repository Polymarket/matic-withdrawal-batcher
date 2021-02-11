# Matic Bridge Batcher

A set of contracts which allows non-custodial batching of withdrawals of ERC20 tokens from Matic network.

## Gas Costs

We can compare the gas costs of batched withdrawals compared with costs of individually withdrawing funds through the Matic bridge. We don't consider any costs associated with transactions on the Matic chain as these are negligible.

### Individual withdrawals

Funds can be withdrawn from Matic by calling the `exit` function on the Matic bridge. Funds will then be sent directly to your wallet.

For an example transaction see: <https://etherscan.io/tx/0x2590933ba187e5a2a0388c5aeb6224fb9e5f341030628bca8224ae875a2d7ec4>

**Bridging cost:** ~180,000 gas per withdrawal

**Final cost:** ~180,000 gas per withdrawal

### Batched withdrawals

To make a batched withdrawal available to be claimed, two transactions must be performed.

1. Funds must withdrawn from the Matic bridge to the RootWithdrawalBatcher contract in the same way as individual withdrawals.
2. The manifest of the recipients of the batch of withdrawals must also be provided to the RootWithdrawalBatcher contract through the `receiveMessage` function

Each of these require verifying a Merkle proof + Merkle-Patricia proof on chain, which makes up the majority of the fixed gas costs.

**Bridging cost:** ~180,000 gas fixed cost

**Distribution cost:** ~120,000 gas fixed cost + ~24000 gas per recipient

**Claiming cost:** ~45000 gas per recipient

**Final cost:** ~300,000 gas fixed cost + ~69000 gas per recipient

The increased overhead from the passing the extra message from Matic to Ethereum is then offset when including 3 or more recipients in a batched withdrawal.

## Possible Attacks

The main avenues for loss of user funds considered are:

1. Funds being locked on the `ChildWithdrawalBatcher` without being included in a withdrawal batch
2. Funds being burned from the `ChildWithdrawalBatcher` in such a way that the funds are not claimable (or are economically unviable to be claimed)

### Mitigation

#### Funds locked on `ChildWithdrawalBatcher`

To avoid the situation where a user has funds trapped in the `ChildWithdrawalBatcher`, the `bridgeWithdrawal` has been made public such that any address may initate a valid batch of withdrawals. A user can include their balance in a valid batched withdrawal at all times. If no valid batched withdrawal can be made then provided they have control of the address which is set to receive the withdrawal then they may also withdraw these funds back onto Matic.

#### Non-claimable withdrawal batches

As arbitrary addresses can initate a batch of withdrawals, this opens the opportunity for a malicious party initating burns such that they cannot be retrieved on the Ethereum chain:

Using a negligible gas costs on Matic, funds could be repeated burned in amounts of less than $1 such that processing these withdrawals on Ethereum would cost many multiples of this. To prevent this a minimum burn amount is implemented such that the value required to process the withdrawal can be ensured to be less than that of the withdrawal itself.

Processing a withdrawal batch on Ethereum consists of an expensive to verify proof-of-inclusion of the `bridgeWithdrawal` function call combined with distributing funds to each recipient - a cost which grows linearly with the number of recipients included in the batch. This combined with the higher block gas limit on Matic leads to the possibility of a batch intentionally including so many recipients such that any attempt to process it will run out of gas. To address this, the maximum number of recipients which can be included in a single batch is limited.

## Usage

### Pre Requisites

Before running any command, make sure to install dependencies:

```sh
yarn install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
yarn compile
```

### TypeChain

Compile the smart contracts and generate TypeChain artifacts:

```sh
yarn build
```

### Lint Solidity

Lint the Solidity code:

```sh
yarn lint:sol
```

### Lint TypeScript

Lint the TypeScript code:

```sh
yarn lint:ts
```

### Test

Run the Mocha tests:

```sh
yarn test
```

### Coverage

Generate the code coverage report:

```sh
yarn coverage
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
yarn clean
```
