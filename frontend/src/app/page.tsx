"use client";

import { useAccount } from "@starknet-react/core";
import { Header } from "@/components/layout/Header";
import { StateIndicator } from "@/components/dashboard/StateIndicator";
import { VaultStatsGrid } from "@/components/dashboard/VaultStatsGrid";
import { AllocationChart } from "@/components/dashboard/AllocationChart";
import { DepositWithdrawPanel } from "@/components/deposit-withdraw/DepositWithdrawPanel";
import { RebalancePanel } from "@/components/rebalance/RebalancePanel";
import { BtcPriceChart } from "@/components/charts/BtcPriceChart";
import { EventLog } from "@/components/events/EventLog";
import { useVault } from "@/hooks/useVault";
import { useManager } from "@/hooks/useManager";
import { Bitcoin, Github, ExternalLink } from "lucide-react";

export default function Dashboard() {
  const { isConnected } = useAccount();
  const vault = useVault();
  const manager = useManager();

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Hero tagline */}
        <div className="text-center space-y-2 py-2">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Your BTC Capital{" "}
            <span className="bg-gradient-to-r from-btc-orange to-btc-gold bg-clip-text text-transparent">
              Never Sleeps
            </span>
          </h2>
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            Auto-switching between Ekubo concentrated LP and Vesu lending — maximizing yield while protecting your Bitcoin.
          </p>
        </div>

        {/* State Indicator */}
        <StateIndicator state={manager.currentState} />

        {/* Stats Grid */}
        <VaultStatsGrid
          totalAssets={vault.totalAssets}
          sharePrice={vault.sharePrice}
          btcPrice={manager.btcPrice}
          userShares={vault.userShares}
          userAssetValue={vault.userAssetValue}
          needsRebalance={manager.needsRebalance}
          isConnected={isConnected ?? false}
        />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            <AllocationChart
              ekuboBps={vault.ekuboAllocationBps}
              vesuBps={vault.vesuAllocationBps}
              bufferBps={vault.bufferBps}
              totalAssets={vault.totalAssets}
            />
            <DepositWithdrawPanel />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <RebalancePanel />
          </div>
        </div>

        {/* Charts section */}
        <div className="grid grid-cols-1 gap-6">
          <BtcPriceChart
            btcPrice={manager.btcPrice}
            lowerBound={manager.lowerBound}
            upperBound={manager.upperBound}
          />
        </div>

        {/* Event Log */}
        <EventLog />
      </main>

      {/* Footer */}
      <footer className="border-t border-vault-border bg-vault-dark/50 py-6 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Bitcoin className="w-4 h-4 text-btc-orange" />
              <span className="text-xs text-gray-500">
                BTCFi Vault — Starknet Re&#123;define&#125; Hackathon 2026
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/hoddukzoa12/BTCLP"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-btc-orange transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                GitHub
              </a>
              <a
                href="https://sepolia.starkscan.co/contract/0x0239c97b2771548702b4462122d6fdbb9f6d4ab66865c6c30fcd758524a91848"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-btc-orange transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Starkscan
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
