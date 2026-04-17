"use client";

import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
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

const valueFormatter = (number: number) =>
  `¥ ${Intl.NumberFormat("ja-JP").format(number)}`;

const tooltipCardClassName =
  "rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50";

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

  if (!mounted) {
    return <div className="min-h-[200px] w-full h-[350px]" />;
  }

  const filteredData = filterByUnifiedTimeRange(data, timeRange, d => d.date);
  const chartData = filteredData.length > 0 ? filteredData : data;

  // 全期間のデータが0の系列は非表示にする（線の重なり防止）
  const activeSeries = areaSeries.filter(item => {
    if (!visibleSeries[item.key]) return false;
    return chartData.some(d => Number(d[item.key] ?? 0) !== 0);
  });
  const hasVisibleSeries = activeSeries.length > 0;

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
          onToggle={(key) =>
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
                <stop offset="5%" stopColor={chartConfig.cash.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={chartConfig.cash.color} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorInvestment" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartConfig.investment.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={chartConfig.investment.color} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorCrypto" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartConfig.crypto.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={chartConfig.crypto.color} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorPoint" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartConfig.point.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={chartConfig.point.color} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorLiability" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartConfig.liability.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={chartConfig.liability.color} stopOpacity={0.02} />
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
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={value => dayjs(value).format("MM/DD")}
              minTickGap={30}
            />
            {/* ガイドブック: Y軸原点を0に */}
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
              wrapperStyle={{ zIndex: 100 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const date = payload[0]?.payload?.date;

                return (
                  <div className={tooltipCardClassName}>
                    <div className="mb-1.5 text-[10px] text-zinc-400">
                      {dayjs(date).format("YYYY/MM/DD")}
                    </div>
                    <div className="space-y-1">
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
        onToggle={(key) =>
          setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }))
        }
      />
    </div>
  );
}

/**
 * 凡例コンポーネント（エリアチャート / ドーナツチャート共通）
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

interface DashboardDonutChartProps {
  data: Record<string, unknown>[];
}

/**
 * 資産構成比を表示するドーナツチャートコンポーネントである．
 * ガイドブック:
 *   - 構成比（%）を凡例に数値表記
 *   - 中央に合計金額を表示
 *   - 色数を4色に制限
 */
export function DashboardDonutChart({ data }: DashboardDonutChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const source = data as { name: string; value: number }[];
  const sourceMap = new Map(source.map(item => [item.name, item.value]));
  // 負債は資産構成比から除外する
  const assetOnlySeries = areaSeries.filter(item => item.key !== "LIABILITY");
  const pieData = assetOnlySeries
    .map(item => ({
      name: item.label,
      value: Number(sourceMap.get(item.label) ?? 0),
      fill: item.color,
    }))
    .filter(item => item.value > 0);

  const hasData = pieData.some(d => d.value > 0);
  const totalValue = useMemo(
    () => pieData.reduce((sum, d) => sum + d.value, 0),
    [pieData],
  );

  if (!mounted) {
    return <div className="mx-auto aspect-square max-h-[250px] pb-0 min-w-0" />;
  }

  if (!hasData) {
    return (
      <div className="flex h-[250px] w-full items-center justify-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-md mx-auto">
        表示するデータがありません
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* ドーナツチャート + 中央に合計金額 */}
      <div className="relative">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[220px] min-w-0 [&_.recharts-pie-label-text]:fill-foreground"
          style={{ width: "100%" }}
        >
          <PieChart>
            <ChartTooltip
              wrapperStyle={{ zIndex: 100 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0];
                const pct = totalValue > 0
                  ? ((Number(item.value ?? 0) / totalValue) * 100).toFixed(1)
                  : "0";
                return (
                  <div className={tooltipCardClassName}>
                    <div className="mb-1 text-[10px] text-zinc-400">
                      {String(item.name ?? "")}
                    </div>
                    <div className="font-mono text-sm font-bold text-zinc-100">
                      {valueFormatter(Number(item.value ?? 0))}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {pct}%
                    </div>
                  </div>
                );
              }}
            />
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={80}
              strokeWidth={3}
              stroke="oklch(0.19 0.01 285)"
            >
              {pieData.map(entry => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        {/* ガイドブック: 円グラフ中央に合計値を表示 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-xs text-zinc-500">合計</div>
            <div className="text-base font-bold text-zinc-100 font-mono">
              {formatCurrency(totalValue)}
            </div>
          </div>
        </div>
      </div>

      {/* ガイドブック: 凡例に構成比（%）を併記（負債は除外） */}
      <div className="mt-3 grid w-full grid-cols-1 gap-1.5 text-sm text-zinc-300">
        {assetOnlySeries.map(item => {
          const val = Number(sourceMap.get(item.label) ?? 0);
          const pct = totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : "0";
          return (
            <div
              key={item.key}
              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
              <span className="ml-auto text-zinc-500 shrink-0 font-mono text-xs">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
