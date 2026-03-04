"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { generatePriceHistory } from "@/lib/mockData";
import { ORACLE_DECIMALS } from "@/lib/constants";

// Wrap entire chart in a single dynamic import to avoid recharts SSR issues
const ChartInner = dynamic(() => import("./BtcPriceChartInner"), { ssr: false });

interface BtcPriceChartProps {
  btcPrice: bigint;
  lowerBound: bigint;
  upperBound: bigint;
}

export function BtcPriceChart({ btcPrice, lowerBound, upperBound }: BtcPriceChartProps) {
  const currentPrice = Number(btcPrice) / 10 ** ORACLE_DECIMALS;
  const lower = Number(lowerBound) / 10 ** ORACLE_DECIMALS;
  const upper = Number(upperBound) / 10 ** ORACLE_DECIMALS;

  const data = useMemo(
    () => generatePriceHistory(currentPrice, lower, upper, 7),
    [currentPrice, lower, upper]
  );

  if (currentPrice === 0) return null;

  return (
    <div className="rounded-xl border border-vault-border bg-vault-card p-5 animate-fade-in">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
        BTC Price &amp; LP Range
      </h3>
      <div className="h-48">
        <ChartInner data={data} lower={lower} upper={upper} />
      </div>
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-btc-orange rounded" />
          <span className="text-gray-500">BTC Price</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-vault-green/10 border border-vault-green/30 rounded-sm" />
          <span className="text-gray-500">LP Range</span>
        </div>
      </div>
    </div>
  );
}
