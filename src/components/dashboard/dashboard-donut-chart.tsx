"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

interface DonutSeries {
  key: string;
  label: string;
  color: string;
}

interface DashboardDonutChartProps {
  assetOnlySeries: readonly DonutSeries[];
  totalAssets: number;
  kpiByAssetType: Record<string, number>;
}

export function DashboardDonutChart({
  assetOnlySeries,
  totalAssets,
  kpiByAssetType,
}: DashboardDonutChartProps) {
  return (
    <div className="relative shrink-0">
      <ChartContainer
        config={Object.fromEntries(
          assetOnlySeries.map(s => [s.key, { label: s.label, color: s.color }]),
        )}
        className="aspect-square w-[160px] [&_.recharts-pie-label-text]:fill-foreground"
      >
        <PieChart>
          <ChartTooltip
            wrapperStyle={{ zIndex: 100 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              const actualValue = Number(item.value ?? 0);
              const pct =
                totalAssets > 0
                  ? ((actualValue / totalAssets) * 100).toFixed(1)
                  : "0";
              return (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50">
                  <div className="mb-1.5 text-sm text-zinc-400">
                    {String(item.name ?? "")}
                  </div>
                  <div className="font-mono text-base font-bold text-zinc-100">
                    {formatCurrency(actualValue)}
                  </div>
                  <div className="text-sm text-zinc-500 mt-0.5">{pct}%</div>
                </div>
              );
            }}
          />
          <Pie
            data={assetOnlySeries.map(s => ({
              name: s.label,
              value: kpiByAssetType[s.key] ?? 0,
              fill: s.color,
            }))}
            dataKey="value"
            nameKey="name"
            innerRadius={35}
            outerRadius={65}
            strokeWidth={2}
            stroke="oklch(0.19 0.01 285)"
          >
            {assetOnlySeries.map(entry => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-sm text-zinc-500">合計</div>
          <div className="text-sm font-bold text-zinc-100 font-mono">
            {formatCurrency(totalAssets)}
          </div>
        </div>
      </div>
    </div>
  );
}
