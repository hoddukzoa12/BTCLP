"use client";

import {
  Coins,
  TrendingUp,
  DollarSign,
  PiggyBank,
  Wallet,
  Target,
} from "lucide-react";
import { formatWbtc, formatUsd, cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  accent?: string;
  delay?: number;
}

function StatCard({ label, value, subValue, icon, accent = "btc-orange", delay = 0 }: StatCardProps) {
  return (
    <div
      className="relative group rounded-xl border border-vault-border bg-vault-card p-5 card-hover animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Subtle top accent line */}
      <div
        className={`absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-${accent} to-transparent opacity-30`}
      />

      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-xl font-mono font-semibold text-white number-value">
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-gray-500 font-mono">{subValue}</p>
          )}
        </div>
        <div className={`p-2 rounded-lg bg-${accent}/10`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface VaultStatsGridProps {
  totalAssets: bigint;
  sharePrice: bigint;
  btcPrice: bigint;
  userShares: bigint;
  userAssetValue: bigint;
  needsRebalance: boolean;
  isConnected: boolean;
}

export function VaultStatsGrid({
  totalAssets,
  sharePrice,
  btcPrice,
  userShares,
  userAssetValue,
  needsRebalance,
  isConnected,
}: VaultStatsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <StatCard
        label="Total Assets"
        value={`${formatWbtc(totalAssets)} wBTC`}
        subValue={btcPrice > 0n ? formatUsd(totalAssets * btcPrice / BigInt(1e8)) : undefined}
        icon={<Coins className="w-5 h-5 text-btc-orange" />}
        delay={0}
      />
      <StatCard
        label="NAV / Share"
        value={`${formatWbtc(sharePrice, 8)} wBTC`}
        subValue="1 share = this amount of wBTC"
        icon={<TrendingUp className="w-5 h-5 text-vault-green" />}
        accent="vault-green"
        delay={50}
      />
      <StatCard
        label="BTC Price"
        value={formatUsd(btcPrice)}
        subValue="via Pragma Oracle"
        icon={<DollarSign className="w-5 h-5 text-btc-gold" />}
        accent="btc-gold"
        delay={100}
      />
      <StatCard
        label="Your Shares"
        value={isConnected ? `${formatWbtc(userShares)} bfVault` : "—"}
        subValue={!isConnected ? "Connect wallet to view" : undefined}
        icon={<PiggyBank className="w-5 h-5 text-vault-blue" />}
        accent="vault-blue"
        delay={150}
      />
      <StatCard
        label="Your Value"
        value={isConnected ? `${formatWbtc(userAssetValue)} wBTC` : "—"}
        subValue={
          isConnected && btcPrice > 0n
            ? formatUsd(userAssetValue * btcPrice / BigInt(1e8))
            : undefined
        }
        icon={<Wallet className="w-5 h-5 text-btc-orange" />}
        delay={200}
      />
      <StatCard
        label="Range Status"
        value={needsRebalance ? "OUT OF RANGE" : "IN RANGE"}
        subValue={needsRebalance ? "Rebalance recommended" : "Position is active"}
        icon={
          <Target
            className={cn(
              "w-5 h-5",
              needsRebalance ? "text-vault-red" : "text-vault-green"
            )}
          />
        }
        accent={needsRebalance ? "vault-red" : "vault-green"}
        delay={250}
      />
    </div>
  );
}
