"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { callContract } from "@/lib/starknet";
import { ADDRESSES } from "@/lib/addresses";
import { POLLING_INTERVAL, ONE_SHARE } from "@/lib/constants";
import { cairo, CallData } from "starknet";

const vaultAddr = ADDRESSES.sepolia.vault;
const wbtcAddr = ADDRESSES.sepolia.wbtc;

// --- Helpers ---

const parseBigInt = (val: unknown): bigint => {
  if (val === undefined || val === null) return 0n;
  try {
    return BigInt(val.toString());
  } catch {
    return 0n;
  }
};

const parseNumber = (val: unknown): number => {
  if (val === undefined || val === null) return 0;
  try {
    return Number(val);
  } catch {
    return 0;
  }
};

/** Decode a u256 from two consecutive felt strings (low, high). */
function u256FromFelts(low: string, high: string): bigint {
  return BigInt(low) + (BigInt(high) << 128n);
}

export function useVault() {
  const { walletAddress, executeTransaction, isTxPending } = useAuth();

  // --- Read calls ---

  const { data: totalAssetsRaw, refetch: refetchTotalAssets } = useQuery({
    queryKey: ["vault", "total_assets"],
    queryFn: () => callContract(vaultAddr, "total_assets"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: totalSupplyRaw } = useQuery({
    queryKey: ["vault", "total_supply"],
    queryFn: () => callContract(vaultAddr, "total_supply"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: sharePriceRaw } = useQuery({
    queryKey: ["vault", "convert_to_assets", "one_share"],
    queryFn: () => {
      const compiled = cairo.uint256(ONE_SHARE);
      return callContract(vaultAddr, "convert_to_assets", [
        compiled.low.toString(),
        compiled.high.toString(),
      ]);
    },
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: ekuboAllocationBpsRaw } = useQuery({
    queryKey: ["vault", "ekubo_allocation_bps"],
    queryFn: () => callContract(vaultAddr, "ekubo_allocation_bps"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: vesuAllocationBpsRaw } = useQuery({
    queryKey: ["vault", "vesu_allocation_bps"],
    queryFn: () => callContract(vaultAddr, "vesu_allocation_bps"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: bufferBpsRaw } = useQuery({
    queryKey: ["vault", "buffer_bps"],
    queryFn: () => callContract(vaultAddr, "buffer_bps"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: isPausedRaw } = useQuery({
    queryKey: ["vault", "is_paused"],
    queryFn: () => callContract(vaultAddr, "is_paused"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: userSharesRaw } = useQuery({
    queryKey: ["vault", "balance_of", walletAddress],
    queryFn: () => callContract(vaultAddr, "balance_of", [walletAddress!]),
    refetchInterval: POLLING_INTERVAL,
    enabled: !!walletAddress,
  });

  // Compute user shares bigint for dependent query
  const userSharesParsed =
    userSharesRaw && userSharesRaw.length >= 2
      ? u256FromFelts(userSharesRaw[0], userSharesRaw[1])
      : 0n;

  const { data: userAssetValueRaw } = useQuery({
    queryKey: ["vault", "convert_to_assets", "user", userSharesParsed.toString()],
    queryFn: () => {
      const compiled = cairo.uint256(userSharesParsed);
      return callContract(vaultAddr, "convert_to_assets", [
        compiled.low.toString(),
        compiled.high.toString(),
      ]);
    },
    refetchInterval: POLLING_INTERVAL,
    enabled: userSharesParsed > 0n,
  });

  const { data: maxWithdrawRaw } = useQuery({
    queryKey: ["vault", "max_withdraw", walletAddress],
    queryFn: () => callContract(vaultAddr, "max_withdraw", [walletAddress!]),
    refetchInterval: POLLING_INTERVAL,
    enabled: !!walletAddress,
  });

  const { data: maxRedeemRaw } = useQuery({
    queryKey: ["vault", "max_redeem", walletAddress],
    queryFn: () => callContract(vaultAddr, "max_redeem", [walletAddress!]),
    refetchInterval: POLLING_INTERVAL,
    enabled: !!walletAddress,
  });

  // --- Write calls ---

  const deposit = async (amount: bigint) => {
    if (!walletAddress) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: wbtcAddr,
        entrypoint: "approve",
        calldata: CallData.compile([vaultAddr, cairo.uint256(amount)]),
      },
      {
        contractAddress: vaultAddr,
        entrypoint: "deposit",
        calldata: CallData.compile([cairo.uint256(amount), walletAddress]),
      },
    ];
    return executeTransaction(calls);
  };

  const withdraw = async (assets: bigint) => {
    if (!walletAddress) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: vaultAddr,
        entrypoint: "withdraw",
        calldata: CallData.compile([
          cairo.uint256(assets),
          walletAddress,
          walletAddress,
        ]),
      },
    ];
    return executeTransaction(calls);
  };

  const redeem = async (shares: bigint) => {
    if (!walletAddress) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: vaultAddr,
        entrypoint: "redeem",
        calldata: CallData.compile([
          cairo.uint256(shares),
          walletAddress,
          walletAddress,
        ]),
      },
    ];
    return executeTransaction(calls);
  };

  // --- Preview hooks ---

  const usePreviewDeposit = (amount: bigint) => {
    const { data } = useQuery({
      queryKey: ["vault", "preview_deposit", amount.toString()],
      queryFn: () => {
        const compiled = cairo.uint256(amount);
        return callContract(vaultAddr, "preview_deposit", [
          compiled.low.toString(),
          compiled.high.toString(),
        ]);
      },
      enabled: amount > 0n,
    });
    // Return an object matching the shape consumers expect (data field with the raw value)
    const parsed = data && data.length >= 2 ? u256FromFelts(data[0], data[1]) : undefined;
    return { data: parsed };
  };

  const usePreviewRedeem = (shares: bigint) => {
    const { data } = useQuery({
      queryKey: ["vault", "preview_redeem", shares.toString()],
      queryFn: () => {
        const compiled = cairo.uint256(shares);
        return callContract(vaultAddr, "preview_redeem", [
          compiled.low.toString(),
          compiled.high.toString(),
        ]);
      },
      enabled: shares > 0n,
    });
    const parsed = data && data.length >= 2 ? u256FromFelts(data[0], data[1]) : undefined;
    return { data: parsed };
  };

  // --- Parse raw felt arrays into final values ---

  const totalAssets =
    totalAssetsRaw && totalAssetsRaw.length >= 2
      ? u256FromFelts(totalAssetsRaw[0], totalAssetsRaw[1])
      : 0n;

  const totalSupply =
    totalSupplyRaw && totalSupplyRaw.length >= 2
      ? u256FromFelts(totalSupplyRaw[0], totalSupplyRaw[1])
      : 0n;

  const sharePrice =
    sharePriceRaw && sharePriceRaw.length >= 2
      ? u256FromFelts(sharePriceRaw[0], sharePriceRaw[1])
      : 0n;

  const ekuboAllocationBps = ekuboAllocationBpsRaw
    ? parseNumber(ekuboAllocationBpsRaw[0])
    : 0;

  const vesuAllocationBps = vesuAllocationBpsRaw
    ? parseNumber(vesuAllocationBpsRaw[0])
    : 0;

  const bufferBps = bufferBpsRaw ? parseNumber(bufferBpsRaw[0]) : 0;

  // is_paused returns a Cairo bool enum: 0 = False, 1 = True
  const isPaused = isPausedRaw ? parseBigInt(isPausedRaw[0]) !== 0n : false;

  const userShares = userSharesParsed;

  const userAssetValue =
    userAssetValueRaw && userAssetValueRaw.length >= 2
      ? u256FromFelts(userAssetValueRaw[0], userAssetValueRaw[1])
      : 0n;

  const maxWithdraw =
    maxWithdrawRaw && maxWithdrawRaw.length >= 2
      ? u256FromFelts(maxWithdrawRaw[0], maxWithdrawRaw[1])
      : 0n;

  const maxRedeem =
    maxRedeemRaw && maxRedeemRaw.length >= 2
      ? u256FromFelts(maxRedeemRaw[0], maxRedeemRaw[1])
      : 0n;

  return {
    // Read data (parsed)
    totalAssets,
    totalSupply,
    sharePrice,
    ekuboAllocationBps,
    vesuAllocationBps,
    bufferBps,
    isPaused,
    userShares,
    userAssetValue,
    maxWithdraw,
    maxRedeem,
    // Write actions
    deposit,
    withdraw,
    redeem,
    isTxPending,
    // Preview hooks
    usePreviewDeposit,
    usePreviewRedeem,
    // Refetch
    refetchTotalAssets,
  };
}
