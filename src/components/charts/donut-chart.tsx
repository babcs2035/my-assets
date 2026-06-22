"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { assetTypeColor, assetTypeLabel, formatCurrency } from "@/lib/utils";

type DonutData = {
  name: string;
  value: number;
  type: string;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DonutData }>;
}) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="glass-card p-3 text-[var(--font-size-chart)]">
      <p className="font-medium text-zinc-300">{data.name}</p>
      <p className="font-mono text-zinc-100">{formatCurrency(data.value)}</p>
    </div>
  );
}

export function DonutChart({ data }: { data: Record<string, number> }) {
  const chartData: DonutData[] = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({
      name: assetTypeLabel(
        type as "CASH" | "INVESTMENT" | "CRYPTO" | "POINT" | "LIABILITY",
      ),
      value,
      type,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-sm text-zinc-500">
        データがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {chartData.map(entry => (
            <Cell
              key={entry.type}
              fill={assetTypeColor(
                entry.type as
                  | "CASH"
                  | "INVESTMENT"
                  | "CRYPTO"
                  | "POINT"
                  | "LIABILITY",
              )}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="bottom"
          formatter={value => (
            <span className="text-[var(--font-size-chart)] text-zinc-300">
              {String(value)}
            </span>
          )}
          wrapperStyle={{ paddingTop: "12px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
