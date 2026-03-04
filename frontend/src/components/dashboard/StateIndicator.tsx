"use client";

import { TrendingUp, Landmark, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { VaultState } from "@/lib/types";
import { STATE_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ICONS = {
  TrendingUp,
  Landmark,
  AlertTriangle,
} as const;

interface StateIndicatorProps {
  state: VaultState;
  isInRange: boolean;
  needsRebalance: boolean;
}

export function StateIndicator({ state, isInRange, needsRebalance }: StateIndicatorProps) {
  const config = STATE_CONFIG[state];
  const Icon = ICONS[config.icon];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border px-6 py-4 ${config.bgClass} ${config.glowClass} transition-all duration-500 animate-fade-in`}
    >
      <div
        className="absolute inset-0 opacity-5"
        style={{
          background: `radial-gradient(ellipse at 20% 50%, var(--${config.color}), transparent 70%)`,
        }}
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Pulsing dot */}
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full ${config.textClass.replace("text-", "bg-")} animate-pulse-dot`}
            />
            <div
              className={`absolute inset-0 w-3 h-3 rounded-full ${config.textClass.replace("text-", "bg-")} opacity-30 animate-ping`}
            />
          </div>

          <div>
            <div className={`flex items-center gap-2 ${config.textClass}`}>
              <Icon className="w-5 h-5" />
              <span className="font-display font-bold text-sm tracking-wider uppercase">
                {config.label}
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-0.5">
              {config.description}
            </p>
          </div>
        </div>

        {/* Right side — price range + rebalance hint */}
        <div className="hidden sm:flex items-center gap-3">
          {/* Price range badge */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
            isInRange
              ? "bg-vault-green/10 text-vault-green border border-vault-green/20"
              : "bg-vault-red/10 text-vault-red border border-vault-red/20"
          )}>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              isInRange ? "bg-vault-green" : "bg-vault-red"
            )} />
            {isInRange ? "IN RANGE" : "OUT OF RANGE"}
          </div>

          {/* Rebalance needed indicator */}
          {needsRebalance && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-btc-orange/10 text-btc-orange border border-btc-orange/20 animate-pulse">
              <ArrowRightLeft className="w-3 h-3" />
              Rebalance
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
