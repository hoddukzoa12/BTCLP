"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface AllocationChartInnerProps {
  data: Array<{ name: string; value: number; color: string }>;
}

export default function AllocationChartInner({ data }: AllocationChartInnerProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={65}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
