import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { hexConcat, hexZeroPad } from "@ethersproject/bytes";

export const encodeDeposit = (address: string, amount: BigNumberish): string =>
  hexConcat([address, hexZeroPad(BigNumber.from(amount).toHexString(), 12)]);

export const encodeDepositMessage = (deposits: [string, BigNumber][]): string =>
  hexConcat(deposits.map(([address, amount]) => encodeDeposit(address, amount)));

export const decodeDeposit = (encodedDeposit: string): [string, BigNumber] => {
  const recipient = encodedDeposit.slice(0, 42);
  const amount = BigNumber.from(encodedDeposit.slice(43));
  return [recipient, amount];
};
