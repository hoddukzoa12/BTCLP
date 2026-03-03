"use client";

import { useAccount, useReadContract, useSendTransaction } from "@starknet-react/core";
import { VAULT_ABI } from "@/lib/abis/vault";
import { ADDRESSES } from "@/lib/addresses";
import { POLLING_INTERVAL, ONE_SHARE } from "@/lib/constants";
import { cairo, CallData } from "starknet";

const vaultAddr = ADDRESSES.sepolia.vault;
const wbtcAddr = ADDRESSES.sepolia.wbtc;

export function useVault() {
  const { address } = useAccount();

  // --- Read calls ---

  const { data: totalAssets, refetch: refetchTotalAssets } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "total_assets",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: totalSupply } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "total_supply",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: sharePrice } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "convert_to_assets",
    args: [cairo.uint256(ONE_SHARE)],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: ekuboAllocationBps } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "ekubo_allocation_bps",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: vesuAllocationBps } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "vesu_allocation_bps",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: bufferBps } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "buffer_bps",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: isPaused } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "is_paused",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: userShares } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "balance_of",
    args: address ? [address] : undefined,
    refetchInterval: POLLING_INTERVAL,
    enabled: !!address,
  });

  const { data: userAssetValue } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "convert_to_assets",
    args: userShares ? [cairo.uint256(BigInt(userShares?.toString() || "0"))] : undefined,
    refetchInterval: POLLING_INTERVAL,
    enabled: !!userShares,
  });

  const { data: maxWithdraw } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "max_withdraw",
    args: address ? [address] : undefined,
    refetchInterval: POLLING_INTERVAL,
    enabled: !!address,
  });

  const { data: maxRedeem } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "max_redeem",
    args: address ? [address] : undefined,
    refetchInterval: POLLING_INTERVAL,
    enabled: !!address,
  });

  // --- Write calls ---

  const { sendAsync: sendTx, isPending: isTxPending } = useSendTransaction({});

  const deposit = async (amount: bigint) => {
    if (!address) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: wbtcAddr,
        entrypoint: "approve",
        calldata: CallData.compile([vaultAddr, cairo.uint256(amount)]),
      },
      {
        contractAddress: vaultAddr,
        entrypoint: "deposit",
        calldata: CallData.compile([cairo.uint256(amount), address]),
      },
    ];
    return sendTx(calls);
  };

  const withdraw = async (assets: bigint) => {
    if (!address) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: vaultAddr,
        entrypoint: "withdraw",
        calldata: CallData.compile([cairo.uint256(assets), address, address]),
      },
    ];
    return sendTx(calls);
  };

  const redeem = async (shares: bigint) => {
    if (!address) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: vaultAddr,
        entrypoint: "redeem",
        calldata: CallData.compile([cairo.uint256(shares), address, address]),
      },
    ];
    return sendTx(calls);
  };

  // --- Preview functions ---

  const usePreviewDeposit = (amount: bigint) => {
    return useReadContract({
      address: vaultAddr,
      abi: VAULT_ABI,
      functionName: "preview_deposit",
      args: amount > 0n ? [cairo.uint256(amount)] : undefined,
      enabled: amount > 0n,
    });
  };

  const usePreviewRedeem = (shares: bigint) => {
    return useReadContract({
      address: vaultAddr,
      abi: VAULT_ABI,
      functionName: "preview_redeem",
      args: shares > 0n ? [cairo.uint256(shares)] : undefined,
      enabled: shares > 0n,
    });
  };

  // Parse raw values safely
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

  return {
    // Read data (parsed)
    totalAssets: parseBigInt(totalAssets),
    totalSupply: parseBigInt(totalSupply),
    sharePrice: parseBigInt(sharePrice),
    ekuboAllocationBps: parseNumber(ekuboAllocationBps),
    vesuAllocationBps: parseNumber(vesuAllocationBps),
    bufferBps: parseNumber(bufferBps),
    isPaused: Boolean(isPaused),
    userShares: parseBigInt(userShares),
    userAssetValue: parseBigInt(userAssetValue),
    maxWithdraw: parseBigInt(maxWithdraw),
    maxRedeem: parseBigInt(maxRedeem),
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
