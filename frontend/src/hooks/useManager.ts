"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { callContract } from "@/lib/starknet";
import { ADDRESSES } from "@/lib/addresses";
import { POLLING_INTERVAL } from "@/lib/constants";
import { VaultState } from "@/lib/types";
import { cairo, CallData } from "starknet";

const managerAddr = ADDRESSES.sepolia.manager;

function decodeVaultState(raw: unknown): VaultState {
  if (raw === undefined || raw === null) return VaultState.EkuboActive;

  // Try numeric conversion first (handles felt "0x0", "0x1", "0x2", BigInt, number)
  try {
    const num = Number(BigInt(String(raw)));
    if (num === 0) return VaultState.EkuboActive;
    if (num === 1) return VaultState.VesuLending;
    if (num === 2) return VaultState.Emergency;
  } catch {
    // Not a numeric value, try string matching
  }

  // starknet.js may return Cairo enums as named variants
  const str = String(raw);
  if (str.includes("EkuboActive")) return VaultState.EkuboActive;
  if (str.includes("VesuLending")) return VaultState.VesuLending;
  if (str.includes("Emergency")) return VaultState.Emergency;

  return VaultState.EkuboActive;
}

export function useManager() {
  const { walletAddress, executeTransaction, isTxPending } = useAuth();

  const { data: rawState } = useQuery({
    queryKey: ["manager", "get_state"],
    queryFn: () => callContract(managerAddr, "get_state"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: rawBtcPrice } = useQuery({
    queryKey: ["manager", "get_btc_price"],
    queryFn: () => callContract(managerAddr, "get_btc_price"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: rawPriceBounds } = useQuery({
    queryKey: ["manager", "get_price_bounds"],
    queryFn: () => callContract(managerAddr, "get_price_bounds"),
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: rawNeedsRebalance } = useQuery({
    queryKey: ["manager", "check_rebalance"],
    queryFn: () => callContract(managerAddr, "check_rebalance"),
    refetchInterval: POLLING_INTERVAL,
  });

  // --- Write calls ---

  const rebalance = async () => {
    if (!walletAddress) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: managerAddr,
        entrypoint: "rebalance",
        calldata: [] as string[],
      },
    ];
    return executeTransaction(calls);
  };

  const emergencyEscape = async () => {
    if (!walletAddress) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: managerAddr,
        entrypoint: "emergency_escape",
        calldata: [] as string[],
      },
    ];
    return executeTransaction(calls);
  };

  const setPriceBounds = async (lower: bigint, upper: bigint) => {
    if (!walletAddress) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: managerAddr,
        entrypoint: "set_price_bounds",
        calldata: CallData.compile([cairo.uint256(lower), cairo.uint256(upper)]),
      },
    ];
    return executeTransaction(calls);
  };

  // --- Parse values ---

  const parseBigInt = (val: unknown): bigint => {
    if (val === undefined || val === null) return 0n;
    try {
      return BigInt(val.toString());
    } catch {
      return 0n;
    }
  };

  // get_state returns a single felt representing the enum variant index
  const currentState = rawState ? decodeVaultState(rawState[0]) : VaultState.EkuboActive;

  // get_btc_price returns a u256 (low, high)
  const btcPrice =
    rawBtcPrice && rawBtcPrice.length >= 2
      ? BigInt(rawBtcPrice[0]) + (BigInt(rawBtcPrice[1]) << 128n)
      : 0n;

  // get_price_bounds returns two u256 values = 4 felts (lower_low, lower_high, upper_low, upper_high)
  let lowerBound = 0n;
  let upperBound = 0n;
  if (rawPriceBounds) {
    try {
      if (rawPriceBounds.length >= 4) {
        // Two u256 values: lower (felts 0,1), upper (felts 2,3)
        lowerBound = BigInt(rawPriceBounds[0]) + (BigInt(rawPriceBounds[1]) << 128n);
        upperBound = BigInt(rawPriceBounds[2]) + (BigInt(rawPriceBounds[3]) << 128n);
      } else if (rawPriceBounds.length >= 2) {
        // Fallback: two single felts
        lowerBound = parseBigInt(rawPriceBounds[0]);
        upperBound = parseBigInt(rawPriceBounds[1]);
      }
    } catch {
      // keep defaults
    }
  }

  // check_rebalance returns a Cairo bool: 0 = false, 1 = true
  const needsRebalance = rawNeedsRebalance
    ? parseBigInt(rawNeedsRebalance[0]) !== 0n
    : false;

  const isOwner =
    walletAddress?.toLowerCase() === ADDRESSES.sepolia.owner.toLowerCase();

  return {
    currentState,
    btcPrice,
    lowerBound,
    upperBound,
    needsRebalance,
    isOwner,
    // Write
    rebalance,
    emergencyEscape,
    setPriceBounds,
    isTxPending,
  };
}
