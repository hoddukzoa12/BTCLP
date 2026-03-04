"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { callContract } from "@/lib/starknet";
import { ADDRESSES } from "@/lib/addresses";
import { POLLING_INTERVAL } from "@/lib/constants";

const wbtcAddr = ADDRESSES.sepolia.wbtc;
const vaultAddr = ADDRESSES.sepolia.vault;

/** Decode a u256 from two consecutive felt strings (low, high). */
function u256FromFelts(low: string, high: string): bigint {
  return BigInt(low) + (BigInt(high) << 128n);
}

export function useWbtcBalance() {
  const { walletAddress } = useAuth();

  const { data: rawBalance } = useQuery({
    queryKey: ["wbtc", "balance_of", walletAddress],
    queryFn: () => callContract(wbtcAddr, "balance_of", [walletAddress!]),
    refetchInterval: POLLING_INTERVAL,
    enabled: !!walletAddress,
  });

  const { data: rawAllowance } = useQuery({
    queryKey: ["wbtc", "allowance", walletAddress, vaultAddr],
    queryFn: () =>
      callContract(wbtcAddr, "allowance", [walletAddress!, vaultAddr]),
    refetchInterval: POLLING_INTERVAL,
    enabled: !!walletAddress,
  });

  const balance =
    rawBalance && rawBalance.length >= 2
      ? u256FromFelts(rawBalance[0], rawBalance[1])
      : 0n;

  const allowance =
    rawAllowance && rawAllowance.length >= 2
      ? u256FromFelts(rawAllowance[0], rawAllowance[1])
      : 0n;

  return {
    balance,
    allowance,
  };
}
