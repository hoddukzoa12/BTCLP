"use client";

import { useAccount, useReadContract, useSendTransaction } from "@starknet-react/core";
import { MANAGER_ABI } from "@/lib/abis/manager";
import { ADDRESSES } from "@/lib/addresses";
import { POLLING_INTERVAL } from "@/lib/constants";
import { VaultState } from "@/lib/types";
import { cairo, CallData } from "starknet";

const managerAddr = ADDRESSES.sepolia.manager;

function decodeVaultState(raw: unknown): VaultState {
  if (raw === undefined || raw === null) return VaultState.EkuboActive;

  // starknet.js returns Cairo enums in various formats
  const str = JSON.stringify(raw);

  if (str.includes("EkuboActive") || str.includes("0")) {
    return VaultState.EkuboActive;
  }
  if (str.includes("VesuLending") || str.includes("1")) {
    return VaultState.VesuLending;
  }
  if (str.includes("Emergency") || str.includes("2")) {
    return VaultState.Emergency;
  }

  // Try numeric
  try {
    const num = Number(raw);
    if (num === 0) return VaultState.EkuboActive;
    if (num === 1) return VaultState.VesuLending;
    if (num === 2) return VaultState.Emergency;
  } catch {
    // fallback
  }

  return VaultState.EkuboActive;
}

export function useManager() {
  const { address } = useAccount();

  const { data: rawState } = useReadContract({
    address: managerAddr,
    abi: MANAGER_ABI,
    functionName: "get_state",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: rawBtcPrice } = useReadContract({
    address: managerAddr,
    abi: MANAGER_ABI,
    functionName: "get_btc_price",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: rawPriceBounds } = useReadContract({
    address: managerAddr,
    abi: MANAGER_ABI,
    functionName: "get_price_bounds",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  const { data: rawNeedsRebalance } = useReadContract({
    address: managerAddr,
    abi: MANAGER_ABI,
    functionName: "check_rebalance",
    args: [],
    refetchInterval: POLLING_INTERVAL,
  });

  // --- Write calls ---

  const { sendAsync: sendTx, isPending: isTxPending } = useSendTransaction({});

  const rebalance = async () => {
    if (!address) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: managerAddr,
        entrypoint: "rebalance",
        calldata: [],
      },
    ];
    return sendTx(calls);
  };

  const emergencyEscape = async () => {
    if (!address) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: managerAddr,
        entrypoint: "emergency_escape",
        calldata: [],
      },
    ];
    return sendTx(calls);
  };

  const setPriceBounds = async (lower: bigint, upper: bigint) => {
    if (!address) throw new Error("Wallet not connected");
    const calls = [
      {
        contractAddress: managerAddr,
        entrypoint: "set_price_bounds",
        calldata: CallData.compile([cairo.uint256(lower), cairo.uint256(upper)]),
      },
    ];
    return sendTx(calls);
  };

  // Parse values
  const parseBigInt = (val: unknown): bigint => {
    if (val === undefined || val === null) return 0n;
    try {
      return BigInt(val.toString());
    } catch {
      return 0n;
    }
  };

  // Parse price bounds (returned as tuple/struct)
  let lowerBound = 0n;
  let upperBound = 0n;
  if (rawPriceBounds) {
    try {
      if (Array.isArray(rawPriceBounds)) {
        lowerBound = BigInt(rawPriceBounds[0]?.toString() || "0");
        upperBound = BigInt(rawPriceBounds[1]?.toString() || "0");
      } else {
        const bounds = rawPriceBounds as Record<string, unknown>;
        lowerBound = BigInt((bounds.lower || bounds[0] || "0").toString());
        upperBound = BigInt((bounds.upper || bounds[1] || "0").toString());
      }
    } catch {
      // keep defaults
    }
  }

  const currentState = decodeVaultState(rawState);
  const btcPrice = parseBigInt(rawBtcPrice);
  const needsRebalance = Boolean(rawNeedsRebalance);
  const isOwner = address?.toLowerCase() === ADDRESSES.sepolia.owner.toLowerCase();

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
