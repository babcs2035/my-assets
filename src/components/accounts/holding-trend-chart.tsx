"use client";

import { TrendingUp } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency } from "@/lib/utils";

type HoldingHistoryItem = {
  date: Date | string;
  valuation: number;
  unitPrice: number;
  gainLoss: number;
  gainLossRate: number;
};

type HoldingWithHistories = {
  id: string;
  name: string;
  quantity: number;
  avgCostBasis: number;
  unitPrice: number;
  valuation: number;
  gainLoss: number;
  gainLossRate: number;
  dayBeforeRatio: number | null;
  holdingHistories: HoldingHistoryItem[];
};

type Props = {
  holdings: HoldingWithHistories[];
};

/**
 * 投資信託の銘柄ごとの時系列チャートコンポーネント
 */
export function HoldingTrendChart({ holdings }: Props) {
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<UnifiedTimeRange>("1Y");

  // 最初の銘柄をデフォルト選択
  if (!selectedHoldingId && holdings.length > 0) {
    setSelectedHoldingId(holdings[0].id);
  }

  const selectedHolding = holdings.find(h => h.id === selectedHoldingId);

  if (holdings.length === 0) return null;
  if (!selectedHolding) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-200">
            <TrendingUp className="h-4 w-4 text-violet-500" />
            銘柄推移
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-zinc-500">
          銘柄データがありません
        </CardContent>
      </Card>
    );
  }

  const chartData = selectedHolding.holdingHistories.map(h => ({
    date:
      typeof h.date === "string" ? h.date : h.date.toISOString().slice(0, 10),
    valuation: h.valuation,
    unitPrice: h.unitPrice,
    gainLoss: h.gainLoss,
    gainLossRate: h.gainLossRate,
  }));

  const filteredData = filterByUnifiedTimeRange(
    chartData,
    timeRange,
    d => d.date,
  );

  const chartDataToShow = filteredData.length > 0 ? filteredData : chartData;

  if (chartDataToShow.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-200">
            <TrendingUp className="h-4 w-4 text-violet-500" />
            銘柄推移
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-zinc-500">
          選択期間のデータがありません
        </CardContent>
      </Card>
    );
  }

  const currentValuation =
    chartDataToShow[chartDataToShow.length - 1]?.valuation ?? 0;
  const [domainMin, domainMax] = getNiceChartDomain(
    chartDataToShow.map(d => d.valuation),
  );
  const isPositive = selectedHolding.gainLoss >= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-200">
          <TrendingUp className="h-4 w-4 text-violet-500" />
          銘柄推移
        </CardTitle>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mt-2">
          <div>
            <div className="text-3xl font-bold tracking-tight text-zinc-50 font-mono">
              {formatCurrency(currentValuation)}
            </div>
            <div className="flex items-center gap-2 text-sm mt-1">
              <span className="text-zinc-400">{selectedHolding.name}</span>
              <span
                className={`font-mono font-medium ${isPositive ? "text-success" : "text-destructive"}`}
              >
                {selectedHolding.gainLoss != null &&
                  `${selectedHolding.gainLossRate >= 0 ? "+" : ""}${selectedHolding.gainLossRate.toFixed(2)}%`}
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto">
            <Select
              value={selectedHoldingId}
              onValueChange={setSelectedHoldingId}
            >
              <SelectTrigger className="w-full lg:w-[320px]">
                <SelectValue placeholder="銘柄を選択" />
              </SelectTrigger>
              <SelectContent>
                {holdings.map(h => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
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
            data={chartDataToShow}
            margin={{ top: 10, right: 10, left: 30, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="colorHoldingValuation"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
              tickLine={false}
              axisLine={false}
              tickFormatter={value => formatYAxisCurrency(Number(value))}
              domain={[domainMin, domainMax]}
              tickCount={6}
              width={70}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  const p = payload[0]
                    .payload as (typeof chartDataToShow)[number];
                  return (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm">
                      <div className="mb-1.5 text-sm text-zinc-400">
                        {String(p.date).replaceAll("-", "/")}
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-zinc-300">評価額</span>
                          <span className="font-mono font-bold text-zinc-100">
                            {formatCurrency(p.valuation)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-zinc-300">基準価額</span>
                          <span className="font-mono font-bold text-zinc-100">
                            {formatCurrency(p.unitPrice)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-zinc-300">評価損益</span>
                          <span
                            className={`font-mono font-bold ${p.gainLoss >= 0 ? "text-success" : "text-destructive"}`}
                          >
                            {formatCurrency(p.gainLoss)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-zinc-300">損益率</span>
                          <span
                            className={`font-mono font-bold ${p.gainLossRate >= 0 ? "text-success" : "text-destructive"}`}
                          >
                            {`${p.gainLossRate >= 0 ? "+" : ""}${p.gainLossRate.toFixed(2)}%`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="valuation"
              stroke="#8b5cf6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorHoldingValuation)"
              isAnimationActive={true}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
