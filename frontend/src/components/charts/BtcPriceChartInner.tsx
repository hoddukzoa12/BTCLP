"use client";

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import type { PricePoint } from "@/lib/types";

interface BtcPriceChartInnerProps {
  data: PricePoint[];
  lower: number;
  upper: number;
}

export default function BtcPriceChartInner({ data, lower, upper }: BtcPriceChartInnerProps) {
  const minY = Math.min(lower * 0.95, ...data.map((d) => d.price));
  const maxY = Math.max(upper * 1.05, ...data.map((d) => d.price));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#F7931A" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#F7931A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          tick={{ fontSize: 10, fill: "#6B7280" }}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={{ stroke: "#1F2937" }}
        />
        <YAxis
          domain={[minY, maxY]}
          tick={{ fontSize: 10, fill: "#6B7280" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          width={45}
        />
        <Tooltip
          contentStyle={{
            background: "#111827",
            border: "1px solid #1F2937",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#E5E7EB",
          }}
          formatter={(value: number) => [`$${value.toLocaleString()}`, "BTC Price"]}
        />
        <ReferenceArea
          y1={lower}
          y2={upper}
          fill="#00E676"
          fillOpacity={0.06}
          stroke="#00E676"
          strokeOpacity={0.2}
          strokeDasharray="3 3"
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke="#F7931A"
          strokeWidth={2}
          fill="url(#priceGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#F7931A", stroke: "#0A0E17", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
