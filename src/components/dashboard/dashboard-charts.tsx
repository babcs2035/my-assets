"use client";

import dayjs from "dayjs";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import { formatCurrency } from "@/lib/utils";

/**
 * ガイドブック準拠のカラーパレット (1〜5色)
 * Blue / Violet / Amber / Emerald の4色体系
 */
const areaSeries = [
  { key: "CASH", label: "預金・現金", color: "#3b82f6" },
  { key: "INVESTMENT", label: "投資信託・証券", color: "#8b5cf6" },
  { key: "CRYPTO", label: "暗号資産", color: "#f59e0b" },
  { key: "POINT", label: "ポイント", color: "#10b981" },
  { key: "LIABILITY", label: "負債", color: "#ef4444" },
] as const;

/**
 * チャートのカラー配色とラベルを定義する設定オブジェクトである．
 */
const chartConfig = {
  cash: { label: "預金・現金", color: areaSeries[0].color },
  investment: { label: "投資信託・証券", color: areaSeries[1].color },
  crypto: { label: "暗号資産", color: areaSeries[2].color },
  point: { label: "ポイント", color: areaSeries[3].color },
  liability: { label: "負債", color: areaSeries[4].color },
} satisfies ChartConfig;

const tooltipCardClassName =
  "rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50";

interface DashboardAreaChartProps {
  data: Array<{
    date: string;
    total: number;
    CASH: number;
    INVESTMENT: number;
    CRYPTO: number;
    POINT: number;
    LIABILITY: number;
  }>;
}

/**
 * ダッシュボードに表示する資産推移 (積み上げエリアチャート) コンポーネントである．
 * ガイドブック:
 *   - グリッド線は最小限（水平のみ）
 *   - 不要な装飾を排除
 *   - 凡例をグラフと隣接
 *   - Y軸原点を0に設定
 */
export function DashboardAreaChart({ data }: DashboardAreaChartProps) {
  const [mounted, setMounted] = useState(false);
  const [timeRange, setTimeRange] = useState<UnifiedTimeRange>("1M");
  const [visibleSeries, setVisibleSeries] = useState<
    Record<(typeof areaSeries)[number]["key"], boolean>
  >({
    CASH: true,
    INVESTMENT: true,
    CRYPTO: true,
    POINT: true,
    LIABILITY: true,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // useMemo を early return より前に配置
  const filteredData = useMemo(
    () => filterByUnifiedTimeRange(data, timeRange, d => d.date),
    [data, timeRange],
  );
  const chartData = useMemo(
    () => (filteredData.length > 0 ? filteredData : data),
    [filteredData, data],
  );

  const activeSeries = useMemo(() => {
    if (chartData.length === 0) return [];
    return areaSeries.filter(item => {
      if (!visibleSeries[item.key]) return false;
      return chartData.some(d => Number(d[item.key] ?? 0) !== 0);
    });
  }, [chartData, visibleSeries]);
  const hasVisibleSeries = activeSeries.length > 0;

  if (!mounted) {
    return (
      <div className="relative flex min-h-[200px] w-full h-[350px] items-center justify-center rounded-lg backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (chartData.length === 0 || !hasVisibleSeries) {
    return (
      <div className="flex flex-col gap-3">
        <UnifiedTimeRangeTabs value={timeRange} onChange={setTimeRange} />
        <div className="flex h-60 w-full items-center justify-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-md">
          {chartData.length === 0
            ? "表示するデータがありません"
            : "表示する項目を選択してください"}
        </div>
        <SeriesLegend
          visibleSeries={visibleSeries}
          onToggle={key =>
            setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }))
          }
        />
      </div>
    );
  }

  // 資産系列（LIABILITY以外）の積み上げ合計を計算
  const assetSeries = activeSeries.filter(item => item.key !== "LIABILITY");
  const liabilitySeries = activeSeries.filter(item => item.key === "LIABILITY");

  const totals = chartData.map(d =>
    assetSeries.reduce((sum, item) => sum + Number(d[item.key] ?? 0), 0),
  );
  const [, maxVal] = getNiceChartDomain(totals);

  // 負債がある場合はY軸の下限を負の値に対応させる
  let minVal = 0;
  if (liabilitySeries.length > 0) {
    const liabilityValues = chartData.map(d => Number(d.LIABILITY ?? 0));
    const minLiability = Math.min(...liabilityValues);
    if (minLiability < 0) {
      // 負債の最小値に20%のマージンを追加
      minVal = Math.floor(minLiability * 1.2);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <UnifiedTimeRangeTabs
        value={timeRange}
        onChange={setTimeRange}
        className="w-full lg:w-auto"
      />
      <div className="h-[280px] w-full">
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
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.cash.color}
                  stopOpacity={0.02}
                />
              </linearGradient>
              <linearGradient id="colorInvestment" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig.investment.color}
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.investment.color}
                  stopOpacity={0.02}
                />
              </linearGradient>
              <linearGradient id="colorCrypto" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig.crypto.color}
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.crypto.color}
                  stopOpacity={0.02}
                />
              </linearGradient>
              <linearGradient id="colorPoint" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig.point.color}
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.point.color}
                  stopOpacity={0.02}
                />
              </linearGradient>
              <linearGradient id="colorLiability" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig.liability.color}
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig.liability.color}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            {/* ガイドブック: グリッド線は水平のみ、薄色 */}
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
              tickFormatter={value => dayjs(value).format("MM/DD")}
              minTickGap={30}
            />
            {/* ガイドブック: Y軸原点を0に */}
            <YAxis
              stroke="#52525b"
              tickLine={false}
              axisLine={false}
              tickFormatter={value => formatYAxisCurrency(Number(value))}
              domain={[minVal, maxVal]}
              tickCount={6}
              width={60}
            />
            <ChartTooltip
              wrapperStyle={{ zIndex: 100 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const date = payload[0]?.payload?.date;

                return (
                  <div className={tooltipCardClassName}>
                    <div className="mb-1.5 text-sm text-zinc-400">
                      {dayjs(date).format("YYYY/MM/DD")}
                    </div>
                    <div className="space-y-1.5">
                      {activeSeries
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
                                    : item.name === "LIABILITY"
                                      ? "負債"
                                      : String(item.name ?? "");

                          return (
                            <div
                              key={String(item.dataKey)}
                              className="flex items-center justify-between gap-4 text-sm"
                            >
                              <span className="flex items-center gap-1.5 text-zinc-300">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                {label}
                              </span>
                              <span className="font-mono font-bold text-zinc-100">
                                {formatCurrency(Number(item.value ?? 0))}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              }}
            />
            {/* 資産系列（積み上げ） */}
            {assetSeries.map(item => (
              <Area
                key={item.key}
                dataKey={item.key}
                type="monotone"
                fill={`url(#color${item.key.charAt(0)}${item.key.slice(1).toLowerCase()})`}
                stroke={item.color}
                strokeWidth={2}
                fillOpacity={0.72}
                stackId="a"
                isAnimationActive={true}
                animationDuration={800}
              />
            ))}
            {/* 負債系列（独立・マイナス域） */}
            {liabilitySeries.map(item => (
              <Area
                key={item.key}
                dataKey={item.key}
                type="monotone"
                fill={`url(#color${item.key.charAt(0)}${item.key.slice(1).toLowerCase()})`}
                stroke={item.color}
                strokeWidth={2}
                fillOpacity={0.72}
                isAnimationActive={true}
                animationDuration={800}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </div>
      {/* ガイドブック: 凡例をグラフ直下に隣接 */}
      <SeriesLegend
        visibleSeries={visibleSeries}
        onToggle={key =>
          setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }))
        }
      />
    </div>
  );
}

/**
 * 凡例コンポーネント（エリアチャート用）
 */
function SeriesLegend({
  visibleSeries,
  onToggle,
}: {
  visibleSeries: Record<(typeof areaSeries)[number]["key"], boolean>;
  onToggle: (key: (typeof areaSeries)[number]["key"]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-300">
      {areaSeries.map(item => (
        <button
          type="button"
          key={item.key}
          onClick={() => onToggle(item.key)}
          aria-pressed={visibleSeries[item.key]}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors ${
            visibleSeries[item.key]
              ? "border-zinc-700 bg-zinc-800/60 text-zinc-100"
              : "border-zinc-800 bg-zinc-900/30 text-zinc-500"
          }`}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: item.color,
              opacity: visibleSeries[item.key] ? 1 : 0.35,
            }}
          />
          <span className="whitespace-nowrap">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
