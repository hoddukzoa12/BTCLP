"use client";

import { TrendingUp, Landmark, AlertTriangle } from "lucide-react";
import { VaultState } from "@/lib/types";
import { STATE_CONFIG } from "@/lib/constants";

const ICONS = {
  TrendingUp,
  Landmark,
  AlertTriangle,
} as const;

interface StateIndicatorProps {
  state: VaultState;
}

export function StateIndicator({ state }: StateIndicatorProps) {
  const config = STATE_CONFIG[state];
  const Icon = ICONS[config.icon];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border px-6 py-4 ${config.bgClass} ${config.glowClass} transition-all duration-500 animate-fade-in`}
    >
      {/* Background gradient effect */}
      <div
        className={`absolute inset-0 opacity-5`}
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

        {/* Right side - strategy indicator */}
        <div className="hidden sm:flex items-center gap-2">
          <div className={`text-xs font-mono ${config.textClass} opacity-60`}>
            {state === VaultState.EkuboActive && "Strategy: Concentrated LP"}
            {state === VaultState.VesuLending && "Strategy: Lending Pool"}
            {state === VaultState.Emergency && "Strategy: Buffer Only"}
          </div>
        </div>
      </div>
    </div>
  );
}
