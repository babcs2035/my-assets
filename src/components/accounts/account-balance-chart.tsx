"use client";

import type { AssetType } from "@prisma/client";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { UnifiedTimeRangeTabs } from "@/components/charts/unified-time-range-tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatYAxisCurrency, getNiceChartDomain } from "@/lib/chart-format";
import {
  filterByUnifiedTimeRange,
  type UnifiedTimeRange,
} from "@/lib/chart-time-range";
import { assetTypeColor, formatCurrency } from "@/lib/utils";

export type ChartDataSerie = {
  id: string; // "total" | subAccountId
  name: string;
  currentBalance: number;
  data: { date: string; balance: number }[];
  assetType?: AssetType;
};

export function AccountBalanceChart({
  series,
  defaultAssetType = "CASH",
}: {
  series: ChartDataSerie[];
  defaultAssetType?: AssetType;
}) {
  const [selectedId, setSelectedId] = useState<string>("total");
  const [timeRange, setTimeRange] = useState<UnifiedTimeRange>("1M");

  const selectedSeries = series.find(s => s.id === selectedId) || series[0];

  // 選択中のシリーズの assetType を取得（なければデフォルト）
  const currentAssetType = selectedSeries?.assetType ?? defaultAssetType;
  const chartColor = assetTypeColor(currentAssetType);

  if (!selectedSeries || selectedSeries.data.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-medium text-zinc-200">
                残高推移（日次）
              </CardTitle>
              <CardDescription className="text-sm">推移データがまだありません</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-zinc-500">
          —
        </CardContent>
      </Card>
    );
  }

  const filteredData = filterByUnifiedTimeRange(
    selectedSeries.data,
    timeRange,
    d => d.date,
  );

  // 万一データが空になってしまった場合のフォールバック（グラフが壊れないため）
  const chartData =
    filteredData.length > 0 ? filteredData : selectedSeries.data;

  // Y軸の最小・最大を少しゆとり持たせるため
  const balances = chartData.map(d => d.balance);
  const [, maxVal] = getNiceChartDomain(balances);

  // 選択された時間範囲における最新の残高（通常は全期間の最新と同じだが安全に取る）
  const currentBalance =
    chartData[chartData.length - 1]?.balance || selectedSeries.currentBalance;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-medium text-zinc-200 mb-1">
              残高推移（日次）
            </CardTitle>
            <div className="text-3xl font-bold tracking-tight text-zinc-50 font-mono mt-2 mb-1">
              {formatCurrency(currentBalance)}
            </div>
            <CardDescription className="text-sm">{selectedSeries.name} の残高推移</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full lg:w-[320px]">
                <SelectValue placeholder="表示する口座を選択" />
              </SelectTrigger>
              <SelectContent>
                {series.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <UnifiedTimeRangeTabs
              value={timeRange}
              onChange={setTimeRange}
              className="w-full lg:w-[320px]"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[250px] w-full p-0 pb-4 pr-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 30, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id={`colorBalance-${selectedId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#27272a"
            />
            <XAxis
              dataKey="date"
              stroke="#52525b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={value => {
                const [year, month, day] = String(value).split("-");
                if (!year || !month || !day) return String(value);
                return `${month}/${day}`;
              }}
              minTickGap={20}
            />
            <YAxis
              stroke="#52525b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={value => formatYAxisCurrency(Number(value))}
              domain={[0, maxVal]}
              tickCount={6}
              width={70}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm">
                      <div className="mb-1 text-[10px] text-zinc-400">
                        {String(payload[0].payload.date).replaceAll("-", "/")}
                      </div>
                      <div className="font-mono text-sm font-bold text-zinc-100">
                        {formatCurrency(payload[0].value as number)}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              key={selectedId}
              type="monotone"
              dataKey="balance"
              stroke={chartColor}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#colorBalance-${selectedId})`}
              isAnimationActive={true}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
