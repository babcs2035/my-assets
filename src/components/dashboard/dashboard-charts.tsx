"use client";

import dayjs from "dayjs";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { UnifiedTimeRangeTabs } from "@/components/charts/unified-time-range-tabs";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { formatYAxisCurrency, getNiceChartDomain } from "@/lib/chart-format";
import {
  filterByUnifiedTimeRange,
  type UnifiedTimeRange,
} from "@/lib/chart-time-range";

/**
 * チャートのカラー配色とラベルを定義する設定オブジェクトである．
 */
const chartConfig = {
  cash: {
    label: "預金・現金",
    color: "var(--color-chart-1)",
  },
  investment: {
    label: "投資信託・証券",
    color: "var(--color-chart-2)",
  },
  crypto: {
    label: "暗号資産",
    color: "var(--color-chart-3)",
  },
  point: {
    label: "ポイント",
    color: "var(--color-chart-4)",
  },
} satisfies ChartConfig;

const areaSeries = [
  { key: "CASH", label: "預金・現金", color: "#3b82f6" },
  { key: "INVESTMENT", label: "投資信託・証券", color: "#8b5cf6" },
  { key: "CRYPTO", label: "暗号資産", color: "#f59e0b" },
  { key: "POINT", label: "ポイント", color: "#10b981" },
] as const;

/**
 * 日本語の資産タイプ名を ChartConfig のキーに変換するためのマッピングである．
 */
/**
 * チャート上の数値を日本円形式にフォーマットする関数である．
 */
const valueFormatter = (number: number) =>
  `¥ ${Intl.NumberFormat("ja-JP").format(number)}`;

const tooltipCardClassName =
  "rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm";

interface DashboardAreaChartProps {
  data: Array<{
    date: string;
    total: number;
    CASH: number;
    INVESTMENT: number;
    CRYPTO: number;
    POINT: number;
  }>;
}

/**
 * ダッシュボードに表示する資産推移 (積み上げエリアチャート) コンポーネントである．
 */
export function DashboardAreaChart({ data }: DashboardAreaChartProps) {
  const [mounted, setMounted] = useState(false);
  const [timeRange, setTimeRange] = useState<UnifiedTimeRange>("1M");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-[200px] w-full h-[350px]" />;
  }

  const filteredData = filterByUnifiedTimeRange(data, timeRange, d => d.date);

  const chartData = filteredData.length > 0 ? filteredData : data;

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <UnifiedTimeRangeTabs value={timeRange} onChange={setTimeRange} />
        <div className="flex h-72 w-full items-center justify-center text-sm text-zinc-500 border border-dashed rounded-md">
          表示するデータがありません．
        </div>
      </div>
    );
  }

  const totals = chartData.map(d => d.total);
  const [minVal, maxVal] = getNiceChartDomain(totals);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <UnifiedTimeRangeTabs
          value={timeRange}
          onChange={setTimeRange}
          className="w-full lg:w-auto"
        />
      </div>
      <div className="h-[300px] w-full">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig.cash.color}
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.cash.color}
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="colorInvestment" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig.investment.color}
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.investment.color}
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="colorCrypto" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig.crypto.color}
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.crypto.color}
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="colorPoint" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig.point.color}
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.point.color}
                  stopOpacity={0.1}
                />
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
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={value => dayjs(value).format("MM/DD")}
              minTickGap={30}
            />
            <YAxis
              stroke="#52525b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={value => formatYAxisCurrency(Number(value))}
              domain={[minVal, maxVal]}
              tickCount={6}
              width={60}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const date = payload[0]?.payload?.date;

                return (
                  <div className={tooltipCardClassName}>
                    <div className="mb-1 text-[10px] text-zinc-400">
                      {dayjs(date).format("YYYY/MM/DD")}
                    </div>
                    <div className="space-y-1">
                      {areaSeries
                        .map(series =>
                          payload.find(
                            item => String(item.name) === series.key,
                          ),
                        )
                        .filter(item => item !== undefined)
                        .map(item => {
                          const label =
                            item.name === "CASH"
                              ? "預金・現金"
                              : item.name === "INVESTMENT"
                                ? "投資信託・証券"
                                : item.name === "CRYPTO"
                                  ? "暗号資産"
                                  : item.name === "POINT"
                                    ? "ポイント"
                                    : String(item.name ?? "");

                          return (
                            <div
                              key={String(item.dataKey)}
                              className="flex items-center justify-between gap-4 text-xs"
                            >
                              <span className="flex items-center gap-1.5 text-zinc-300">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                {label}
                              </span>
                              <span className="font-mono font-bold text-zinc-100">
                                {valueFormatter(Number(item.value ?? 0))}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              }}
            />
            <Area
              dataKey="CASH"
              type="monotone"
              fill="url(#colorCash)"
              stroke={areaSeries[0].color}
              strokeWidth={0}
              fillOpacity={0.95}
              stackId="a"
              isAnimationActive={true}
              animationDuration={800}
            />
            <Area
              dataKey="INVESTMENT"
              type="monotone"
              fill="url(#colorInvestment)"
              stroke={areaSeries[1].color}
              strokeWidth={0}
              fillOpacity={0.95}
              stackId="a"
              isAnimationActive={true}
              animationDuration={800}
            />
            <Area
              dataKey="CRYPTO"
              type="monotone"
              fill="url(#colorCrypto)"
              stroke={areaSeries[2].color}
              strokeWidth={0}
              fillOpacity={0.95}
              stackId="a"
              isAnimationActive={true}
              animationDuration={800}
            />
            <Area
              dataKey="POINT"
              type="monotone"
              fill="url(#colorPoint)"
              stroke={areaSeries[3].color}
              strokeWidth={0}
              fillOpacity={0.95}
              stackId="a"
              isAnimationActive={true}
              animationDuration={800}
            />
          </AreaChart>
        </ChartContainer>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-300">
        {areaSeries.map(item => (
          <div
            key={item.key}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="whitespace-nowrap">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DashboardDonutChartProps {
  data: Record<string, unknown>[];
}

/**
 * 資産構成比を表示するドーナツチャートコンポーネントである．
 */
export function DashboardDonutChart({ data }: DashboardDonutChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const source = data as { name: string; value: number }[];
  const sourceMap = new Map(source.map(item => [item.name, item.value]));
  const pieData = areaSeries
    .map(item => ({
      name: item.label,
      value: Number(sourceMap.get(item.label) ?? 0),
      fill: item.color,
    }))
    .filter(item => item.value > 0);

  const hasData = pieData.some(d => d.value > 0);

  if (!mounted) {
    return <div className="mx-auto aspect-square max-h-[250px] pb-0 min-w-0" />;
  }

  // 有効なデータ (値が 0 より大きい要素) がない場合の表示である．
  if (!hasData) {
    return (
      <div className="flex h-[250px] w-full items-center justify-center text-sm text-zinc-500 border border-dashed rounded-md mx-auto">
        表示するデータがありません．
      </div>
    );
  }

  return (
    <div className="w-full">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[250px] min-w-0 [&_.recharts-pie-label-text]:fill-foreground"
        style={{ width: "100%" }}
      >
        <PieChart>
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              return (
                <div className={tooltipCardClassName}>
                  <div className="mb-1 text-[10px] text-zinc-400">
                    {String(item.name ?? "")}
                  </div>
                  <div className="font-mono text-sm font-bold text-zinc-100">
                    {valueFormatter(Number(item.value ?? 0))}
                  </div>
                </div>
              );
            }}
          />
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            strokeWidth={5}
          />
        </PieChart>
      </ChartContainer>
      <div className="mt-3 grid w-full grid-cols-1 gap-2 text-xs text-zinc-300 sm:grid-cols-2">
        {areaSeries.map(item => (
          <div
            key={item.key}
            className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
