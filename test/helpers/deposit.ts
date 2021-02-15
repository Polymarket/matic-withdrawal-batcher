import { BigNumber } from "@ethersproject/bignumber";
import { Zero } from "@ethersproject/constants";
import { ContractReceipt } from "ethers";
import { ChildWithdrawalBatcher } from "../../typechain";
import { encodeDeposit } from "./encoding";

/**
 *
 * @param childBatcherContract
 * @param deposits
 */
export const depositFunds = async (
  childBatcherContract: ChildWithdrawalBatcher,
  deposits: [string, string][],
): Promise<ContractReceipt> => {
  for (let i = 0; i < deposits.length; i += 1) {
    const [currentRecipient, currentAmount] = deposits[i];
    // eslint-disable-next-line no-await-in-loop
    await childBatcherContract.depositFor(currentRecipient, currentAmount);
  }

  // Deduplicate deposits to the same recipient
  const expectedBalances = deposits.reduce((acc, [recipient, amount]) => {
    acc[recipient] = (acc[recipient] || Zero).add(amount);
    return acc;
  }, {} as { [key: string]: BigNumber });
  const encodedDeposits = Object.entries(expectedBalances).map(deposit => encodeDeposit(...deposit));

  const bridgeTx = await childBatcherContract.bridgeWithdrawals(encodedDeposits);
  return bridgeTx.wait();
};
