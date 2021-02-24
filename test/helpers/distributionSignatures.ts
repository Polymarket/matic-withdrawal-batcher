import { TypedDataDomain } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";
import { Wallet } from "@ethersproject/wallet";

export type Claim = {
  recipient: string;
  amount: BigNumberish;
  internalClaim: boolean;
};

export type ClaimDistribution = {
  balanceOwner: string;
  claims: Claim[];
  nonce: BigNumberish;
};

export const signDistribution = async (
  balanceOwnerWallet: Wallet,
  domain: TypedDataDomain,
  claims: Claim[],
  nonce = 0,
): Promise<string> => {
  const types = {
    ClaimDistribution: [
      { name: "balanceOwner", type: "address" },
      { name: "claims", type: "Claim[]" },
      { name: "nonce", type: "uint256" },
    ],
    Claim: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "internalClaim", type: "bool" },
    ],
  };
  const value = {
    balanceOwner: balanceOwnerWallet.address,
    claims,
    nonce,
  };

  // eslint-disable-next-line no-underscore-dangle
  return balanceOwnerWallet._signTypedData(domain, types, value);
};
