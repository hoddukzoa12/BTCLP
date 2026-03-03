export enum VaultState {
  EkuboActive = 0,
  VesuLending = 1,
  Emergency = 2,
}

export interface VaultData {
  totalAssets: bigint;
  totalSupply: bigint;
  sharePrice: bigint;
  ekuboAllocationBps: number;
  vesuAllocationBps: number;
  bufferBps: number;
  isPaused: boolean;
  userShares: bigint;
  userAssetValue: bigint;
}

export interface ManagerData {
  currentState: VaultState;
  btcPrice: bigint;
  lowerBound: bigint;
  upperBound: bigint;
  needsRebalance: boolean;
}

export interface OracleData {
  btcPrice: bigint;
  btcPriceUsd: number;
  isStale: boolean;
  lastUpdated: number;
}

export interface PricePoint {
  time: string;
  price: number;
  lower: number;
  upper: number;
}

export interface AllocationPoint {
  time: string;
  ekubo: number;
  vesu: number;
  buffer: number;
}

export interface VaultEvent {
  id: string;
  type: EventType;
  timestamp: number;
  txHash: string;
  data: Record<string, string>;
}

export type EventType =
  | "Deposit"
  | "Withdraw"
  | "AllocationChanged"
  | "StateChanged"
  | "RebalanceExecuted"
  | "EmergencyWithdraw"
  | "Paused"
  | "Unpaused";
