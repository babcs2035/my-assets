"use client";

import { ListPlus, TrendingUp } from "lucide-react";
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
import {
  addDaysToDateKey,
  forwardFillByDate,
  listDateKeysBetween,
} from "@/lib/daily-series";
import { formatCurrency } from "@/lib/utils";

type HoldingHistoryItem = {
  date: Date | string;
  valuation: number;
  unitPrice: number | null;
  gainLoss: number;
  gainLossRate: number;
};

type HoldingWithHistories = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  valuation: number;
  gainLoss: number;
  gainLossRate: number;
  dayBeforeRatio: number | null;
  holdingHistories: HoldingHistoryItem[];
};

type Props = {
  holdings: HoldingWithHistories[];
  // 売却した銘柄の履歴（銘柄ごとの配列）．銘柄の選択肢には出さず，合計にだけ使う
  soldHoldings?: HoldingHistoryItem[][];
};

// HoldingHistory.date は JST の日付を UTC 00:00 で保存しているので，先頭 10 文字が JST の日付になる
function toDateKey(date: Date | string): string {
  return (typeof date === "string" ? date : date.toISOString()).slice(0, 10);
}

/**
 * 投資信託の銘柄ごとの時系列チャートコンポーネント
 */
export function HoldingTrendChart({ holdings, soldHoldings = [] }: Props) {
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<UnifiedTimeRange>("1Y");

  // 最初の銘柄をデフォルト選択
  if (!selectedHoldingId && holdings.length > 0) {
    setSelectedHoldingId(holdings[0].id);
  }

  const isTotal = selectedHoldingId === "total";
  const selectedHolding = isTotal
    ? undefined
    : holdings.find(h => h.id === selectedHoldingId);

  if (holdings.length === 0) return null;
  if (!isTotal && !selectedHolding) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-200">
            <TrendingUp className="h-4 w-4 text-violet-500" />
            銘柄推移
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-zinc-400">
          銘柄データがありません
        </CardContent>
      </Card>
    );
  }

  // 合計モード: 全銘柄の履歴を日付でマージして合算
  let chartData: Array<{
    date: string;
    valuation: number;
    unitPrice: number | null;
    gainLoss: number;
    gainLossRate: number;
    acquisitionCost: number;
  }>;

  if (isTotal) {
    // 銘柄ごとに直前の値で埋めてから合計する (ACC-9)．記録のある日だけを足すと，
    // 一部の銘柄だけ記録が欠けた日に合計が落ち込む．売却した銘柄も過去の合計には含める
    const toPoints = (seriesKey: string, histories: HoldingHistoryItem[]) =>
      histories.map(hist => ({
        seriesKey,
        dateKey: toDateKey(hist.date),
        value: {
          valuation: hist.valuation,
          acquisitionCost: hist.valuation - hist.gainLoss,
          gainLoss: hist.gainLoss,
        },
      }));
    const historyPoints = [
      ...holdings.flatMap(h => toPoints(h.id, h.holdingHistories)),
      ...soldHoldings.flatMap((histories, index) =>
        toPoints(`sold-${index}`, histories),
      ),
    ];
    // 売却した銘柄は最後の記録の翌日に 0 を置き，売却後も最後の評価額が合計に残り続けないようにする
    const soldEndPoints = soldHoldings.flatMap((histories, index) => {
      const dateKeys = histories.map(hist => toDateKey(hist.date)).sort();
      if (dateKeys.length === 0) return [];
      return [
        {
          seriesKey: `sold-${index}`,
          dateKey: addDaysToDateKey(dateKeys[dateKeys.length - 1], 1),
          value: { valuation: 0, acquisitionCost: 0, gainLoss: 0 },
        },
      ];
    });

    const recordedDateKeys = historyPoints.map(p => p.dateKey).sort();
    const dateKeys =
      recordedDateKeys.length === 0
        ? []
        : listDateKeysBetween(
            recordedDateKeys[0],
            recordedDateKeys[recordedDateKeys.length - 1],
          );

    chartData = forwardFillByDate(
      [...historyPoints, ...soldEndPoints],
      dateKeys,
    ).map(({ dateKey, values }) => {
      let valuation = 0;
      let acquisitionCost = 0;
      let gainLoss = 0;
      for (const v of values.values()) {
        valuation += v.valuation;
        acquisitionCost += v.acquisitionCost;
        gainLoss += v.gainLoss;
      }
      return {
        date: dateKey,
        valuation,
        unitPrice: null,
        gainLoss,
        gainLossRate:
          acquisitionCost > 0 ? (gainLoss / acquisitionCost) * 100 : 0,
        acquisitionCost,
      };
    });
  } else {
    chartData =
      selectedHolding?.holdingHistories.map(h => ({
        date: toDateKey(h.date),
        valuation: h.valuation,
        unitPrice: h.unitPrice,
        gainLoss: h.gainLoss,
        gainLossRate: h.gainLossRate,
        acquisitionCost: h.valuation - h.gainLoss,
      })) ?? [];
  }

  const filteredData = filterByUnifiedTimeRange(
    chartData,
    timeRange,
    d => d.date,
  );

  // 期間内が空でも全期間に差し替えない（同期が止まったときに，選んだ期間と違う範囲が出て気付けないため）．
  // 空のときは本体だけを空表示にし，期間タブのあるヘッダーは残す
  const chartDataToShow = filteredData;

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-200">
            <TrendingUp className="h-4 w-4 text-violet-500" />
            銘柄推移
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-zinc-400">
          推移データがまだありません
        </CardContent>
      </Card>
    );
  }

  // 期間内が空のときも，見出しには全期間の最新値を出す（¥0 と +0.00% に見えないようにする）
  const latestPoint =
    chartDataToShow[chartDataToShow.length - 1] ??
    chartData[chartData.length - 1];
  const latestDate = chartData[chartData.length - 1].date;
  const currentValuation = latestPoint.valuation;
  const allValues = chartDataToShow.flatMap(d => [
    d.valuation,
    d.acquisitionCost,
  ]);
  const [domainMin, domainMax] = getNiceChartDomain(allValues);
  const totalGainLoss = latestPoint.gainLoss;
  const totalGainLossRate = latestPoint.gainLossRate;
  const isPositive = totalGainLoss >= 0;

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
              <span className="text-zinc-400">
                {isTotal ? "合計" : (selectedHolding?.name ?? "")}
              </span>
              <span
                className={`font-mono font-medium ${isPositive ? "text-success" : "text-destructive"}`}
              >
                {totalGainLossRate >= 0 ? "+" : ""}
                {totalGainLossRate.toFixed(2)}%
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
                <SelectItem value="total">
                  <span className="inline-flex items-center gap-1.5">
                    <ListPlus className="h-3.5 w-3.5 text-zinc-400" />
                    合計
                  </span>
                </SelectItem>
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
      {chartDataToShow.length === 0 ? (
        <CardContent className="flex items-center justify-center h-[250px] text-sm text-zinc-400">
          選択した期間のデータがありません（最新: {latestDate}）
        </CardContent>
      ) : (
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
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id="colorHoldingAcquisition"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#27272a"
              />
              <XAxis
                dataKey="date"
                stroke="#a1a1aa"
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
                stroke="#a1a1aa"
                tickLine={false}
                axisLine={false}
                tickFormatter={value => formatYAxisCurrency(Number(value))}
                domain={[domainMin, domainMax]}
                tickCount={6}
                width={56}
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
                            <span className="text-zinc-300">取得価額</span>
                            <span className="font-mono font-bold text-blue-400">
                              {formatCurrency(p.acquisitionCost)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-zinc-300">評価額</span>
                            <span className="font-mono font-bold text-zinc-100">
                              {formatCurrency(p.valuation)}
                            </span>
                          </div>
                          {p.unitPrice != null && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-zinc-300">基準価額</span>
                              <span className="font-mono font-bold text-zinc-100">
                                {formatCurrency(p.unitPrice)}
                              </span>
                            </div>
                          )}
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
                type="linear"
                dataKey="acquisitionCost"
                stroke="#60a5fa"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#colorHoldingAcquisition)"
                isAnimationActive={true}
                animationDuration={800}
              />
              <Area
                type="linear"
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
      )}
    </Card>
  );
}
