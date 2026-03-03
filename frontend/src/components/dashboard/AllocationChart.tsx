"use client";

import dynamic from "next/dynamic";
import { formatWbtc, formatBps } from "@/lib/utils";

// Wrap entire chart in a single dynamic import to avoid recharts SSR issues
const ChartInner = dynamic(() => import("./AllocationChartInner"), { ssr: false });

interface AllocationChartProps {
  ekuboBps: number;
  vesuBps: number;
  bufferBps: number;
  totalAssets: bigint;
}

const COLORS = {
  ekubo: "#00E676",
  vesu: "#448AFF",
  buffer: "#4B5563",
};

export function AllocationChart({
  ekuboBps,
  vesuBps,
  bufferBps,
  totalAssets,
}: AllocationChartProps) {
  const data = [
    { name: "Ekubo LP", value: ekuboBps, color: COLORS.ekubo },
    { name: "Vesu Lending", value: vesuBps, color: COLORS.vesu },
    { name: "Buffer", value: bufferBps, color: COLORS.buffer },
  ].filter((d) => d.value > 0);

  return (
    <div className="rounded-xl border border-vault-border bg-vault-card p-5 animate-fade-in">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
        Strategy Allocation
      </h3>

      <div className="flex items-center gap-6">
        {/* Chart */}
        <div className="w-40 h-40 relative">
          <ChartInner data={data} />
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-gray-500">Total</span>
            <span className="text-sm font-mono font-bold text-white">
              {formatWbtc(totalAssets, 4)}
            </span>
            <span className="text-[10px] text-gray-500">wBTC</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {[
            { label: "Ekubo LP", bps: ekuboBps, color: COLORS.ekubo, desc: "Concentrated Liquidity" },
            { label: "Vesu Lending", bps: vesuBps, color: COLORS.vesu, desc: "Lending Pool" },
            { label: "Buffer", bps: bufferBps, color: COLORS.buffer, desc: "Vault Reserve" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{item.label}</span>
                  <span className="text-sm font-mono font-medium text-white">
                    {formatBps(item.bps)}
                  </span>
                </div>
                <p className="text-[10px] text-gray-600">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
