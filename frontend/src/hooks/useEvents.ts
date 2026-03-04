"use client";

import { useQuery } from "@tanstack/react-query";
import { getProvider } from "@/lib/starknet";
import { ADDRESSES } from "@/lib/addresses";
import { hash } from "starknet";
import { POLLING_INTERVAL } from "@/lib/constants";

// Known event names from Manager and Vault contracts
const EVENT_NAMES = [
  "Deposit",
  "Withdraw",
  "StateChanged",
  "RebalanceExecuted",
  "PriceBoundsUpdated",
  "AllocationChanged",
  "EmergencyWithdraw",
  "Paused",
  "Unpaused",
  "Transfer",
  "Approval",
] as const;

// Build selector → name reverse map
const SELECTOR_TO_NAME: Record<string, string> = {};
for (const name of EVENT_NAMES) {
  const selector = hash.getSelectorFromName(name);
  SELECTOR_TO_NAME[selector] = name;
  // Also store lowercase version for matching
  SELECTOR_TO_NAME[selector.toLowerCase()] = name;
}

export interface OnChainEvent {
  id: string;
  type: string;
  blockNumber: number;
  txHash: string;
  fromAddress: string;
  data: string[];
  keys: string[];
}

async function fetchContractEvents(address: string, chunkSize: number) {
  const provider = getProvider();
  try {
    const response = await provider.getEvents({
      address,
      from_block: { block_number: 0 },
      to_block: "latest" as never,
      chunk_size: chunkSize,
      keys: [],
    });
    return response.events;
  } catch {
    // Fallback: try without to_block string
    try {
      const response = await provider.getEvents({
        address,
        from_block: { block_number: 0 },
        to_block: { block_tag: "latest" } as never,
        chunk_size: chunkSize,
        keys: [],
      });
      return response.events;
    } catch {
      return [];
    }
  }
}

export function useEvents() {
  return useQuery({
    queryKey: ["onchain-events"],
    queryFn: async (): Promise<OnChainEvent[]> => {
      const [managerEvents, vaultEvents] = await Promise.all([
        fetchContractEvents(ADDRESSES.sepolia.manager, 25),
        fetchContractEvents(ADDRESSES.sepolia.vault, 25),
      ]);

      const allEvents = [...managerEvents, ...vaultEvents];

      // Sort by block number descending (most recent first)
      allEvents.sort((a, b) => b.block_number - a.block_number);

      // Map to our format, filter out unknown/internal events
      return allEvents
        .map((event, i) => {
          const selector = event.keys[0];
          const name =
            SELECTOR_TO_NAME[selector] ||
            SELECTOR_TO_NAME[selector?.toLowerCase()] ||
            null;

          return {
            id: `${event.transaction_hash}-${i}`,
            type: name || "",
            blockNumber: event.block_number,
            txHash: event.transaction_hash,
            fromAddress: event.from_address,
            data: event.data,
            keys: event.keys,
          };
        })
        .filter((e) => e.type && !["Transfer", "Approval"].includes(e.type))
        .slice(0, 20);
    },
    refetchInterval: POLLING_INTERVAL,
  });
}
