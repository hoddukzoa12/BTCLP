"use client";

import { useAccount, useReadContract } from "@starknet-react/core";
import { ERC20_ABI } from "@/lib/abis/erc20";
import { ADDRESSES } from "@/lib/addresses";
import { POLLING_INTERVAL } from "@/lib/constants";

const wbtcAddr = ADDRESSES.sepolia.wbtc;
const vaultAddr = ADDRESSES.sepolia.vault;

export function useWbtcBalance() {
  const { address } = useAccount();

  const { data: rawBalance } = useReadContract({
    address: wbtcAddr,
    abi: ERC20_ABI,
    functionName: "balance_of",
    args: address ? [address] : undefined,
    refetchInterval: POLLING_INTERVAL,
    enabled: !!address,
  });

  const { data: rawAllowance } = useReadContract({
    address: wbtcAddr,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, vaultAddr] : undefined,
    refetchInterval: POLLING_INTERVAL,
    enabled: !!address,
  });

  const parseBigInt = (val: unknown): bigint => {
    if (val === undefined || val === null) return 0n;
    try {
      return BigInt(val.toString());
    } catch {
      return 0n;
    }
  };

  return {
    balance: parseBigInt(rawBalance),
    allowance: parseBigInt(rawAllowance),
  };
}
