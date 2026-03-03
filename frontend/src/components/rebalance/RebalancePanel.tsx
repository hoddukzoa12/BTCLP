"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Shield,
  Zap,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { useManager } from "@/hooks/useManager";
import { formatUsd, cn } from "@/lib/utils";
import { ORACLE_DECIMALS } from "@/lib/constants";

export function RebalancePanel() {
  const manager = useManager();
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);

  const btcPriceNum = Number(manager.btcPrice) / 10 ** ORACLE_DECIMALS;
  const lowerNum = Number(manager.lowerBound) / 10 ** ORACLE_DECIMALS;
  const upperNum = Number(manager.upperBound) / 10 ** ORACLE_DECIMALS;

  // Range position percentage (clamped 0-100)
  const rangeWidth = upperNum - lowerNum;
  const pricePosition =
    rangeWidth > 0
      ? Math.max(0, Math.min(100, ((btcPriceNum - lowerNum) / rangeWidth) * 100))
      : 50;
  const isInRange = btcPriceNum >= lowerNum && btcPriceNum <= upperNum;

  const handleRebalance = async () => {
    setIsRebalancing(true);
    try {
      await manager.rebalance();
      toast.success("Rebalance submitted!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Rebalance failed";
      toast.error("Rebalance failed", { description: message });
    } finally {
      setIsRebalancing(false);
    }
  };

  const handleEmergencyEscape = async () => {
    try {
      await manager.emergencyEscape();
      toast.success("Emergency escape submitted!");
      setShowEmergencyConfirm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Emergency escape failed";
      toast.error("Emergency escape failed", { description: message });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Oracle Panel */}
      <div className="rounded-xl border border-vault-border bg-vault-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-btc-orange" />
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Oracle & Price
          </h3>
        </div>

        <div className="flex items-end justify-between mb-1">
          <div>
            <p className="text-3xl font-mono font-bold text-btc-orange">
              {formatUsd(manager.btcPrice)}
            </p>
            <p className="text-xs text-gray-500 mt-1">BTC/USD via Pragma Oracle</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-2 h-2 rounded-full",
              manager.btcPrice > 0n ? "bg-vault-green" : "bg-vault-red"
            )} />
            <span className={cn(
              "text-xs font-mono",
              manager.btcPrice > 0n ? "text-vault-green" : "text-vault-red"
            )}>
              {manager.btcPrice > 0n ? "Fresh" : "Stale"}
            </span>
          </div>
        </div>
      </div>

      {/* Range Indicator */}
      <div className="rounded-xl border border-vault-border bg-vault-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-vault-blue" />
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            LP Price Range
          </h3>
        </div>

        {/* Range bar */}
        <div className="space-y-3">
          <div className="relative h-10 rounded-lg bg-vault-surface overflow-hidden">
            {/* Active range zone */}
            <div className="absolute inset-y-0 left-0 right-0 bg-vault-green/10" />

            {/* Price marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 transition-all duration-500"
              style={{ left: `${pricePosition}%` }}
            >
              <div className={cn(
                "absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2",
                isInRange
                  ? "bg-vault-green border-vault-green/50 shadow-[0_0_10px_rgba(0,230,118,0.3)]"
                  : "bg-vault-red border-vault-red/50 shadow-[0_0_10px_rgba(255,23,68,0.3)]"
              )} />
              <div className={cn(
                "absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono",
                isInRange ? "text-vault-green" : "text-vault-red"
              )}>
                ${btcPriceNum.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          {/* Bounds labels */}
          <div className="flex justify-between">
            <span className="text-xs font-mono text-gray-500">
              ${lowerNum.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
              isInRange
                ? "bg-vault-green/10 text-vault-green"
                : "bg-vault-red/10 text-vault-red"
            )}>
              {isInRange ? "IN RANGE" : "OUT OF RANGE"}
            </div>
            <span className="text-xs font-mono text-gray-500">
              ${upperNum.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-xl border border-vault-border bg-vault-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-btc-gold" />
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Actions
          </h3>
          {!manager.isOwner && (
            <span className="text-[10px] text-gray-600 ml-auto">(Owner only)</span>
          )}
        </div>

        <div className="space-y-3">
          {/* Rebalance button */}
          <button
            onClick={handleRebalance}
            disabled={!manager.isOwner || !manager.needsRebalance || isRebalancing}
            className={cn(
              "w-full py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2",
              manager.needsRebalance && manager.isOwner
                ? "bg-vault-blue text-white hover:shadow-lg hover:shadow-vault-blue/20"
                : "bg-gray-800 text-gray-600 cursor-not-allowed"
            )}
          >
            <ArrowDownUp className="w-4 h-4" />
            {isRebalancing ? "Rebalancing..." : "Execute Rebalance"}
          </button>

          {/* Emergency section */}
          {manager.isOwner && (
            <div className="pt-3 border-t border-vault-border">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-3 h-3 text-vault-red" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Emergency Controls
                </span>
              </div>

              {!showEmergencyConfirm ? (
                <button
                  onClick={() => setShowEmergencyConfirm(true)}
                  className="w-full py-2 rounded-lg border border-vault-red/30 text-vault-red text-xs hover:bg-vault-red/10 transition-colors"
                >
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Emergency Escape
                </button>
              ) : (
                <div className="space-y-2 p-3 rounded-lg bg-vault-red/5 border border-vault-red/20">
                  <p className="text-[11px] text-vault-red">
                    This will force all assets to Vesu lending and set Emergency state.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleEmergencyEscape}
                      className="flex-1 py-2 rounded-lg bg-vault-red text-white text-xs font-medium"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setShowEmergencyConfirm(false)}
                      className="flex-1 py-2 rounded-lg border border-vault-border text-gray-400 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
