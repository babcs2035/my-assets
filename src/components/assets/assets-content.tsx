"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

type Breakdown = Awaited<
  ReturnType<typeof import("@/actions/assets").getAssetBreakdown>
>;

interface AssetsContentProps {
  breakdown: Breakdown;
}

const assetColors = {
  CASH: "#3b82f6",
  INVESTMENT: "#8b5cf6",
  CRYPTO: "#f59e0b",
  POINT: "#10b981",
  LIABILITY: "#ef4444",
};

export function AssetsContent({ breakdown }: AssetsContentProps) {
  const { assets, liabilities, totalAssets, totalLiabilities, netWorth } =
    breakdown;

  // 投資信託・証券詳細のソート状態
  type SortKey = "valuation" | "gainLossRate";
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey | null;
    direction: "asc" | "desc";
  }>({ key: null, direction: "desc" });

  const holdings = useMemo(
    () =>
      assets
        .flatMap(a =>
          (a.holdings ?? []).map(h => ({
            ...h,
            account: a.account,
          })),
        )
        .sort((a, b) => {
          if (!sortConfig.key) return 0;
          const aVal =
            sortConfig.key === "valuation" ? a.valuation : a.gainLossRate;
          const bVal =
            sortConfig.key === "valuation" ? b.valuation : b.gainLossRate;
          const mul = sortConfig.direction === "asc" ? 1 : -1;
          return (aVal - bVal) * mul;
        }),
    [assets, sortConfig],
  );

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  // 資産の pie chart データ
  const assetPieData = useMemo(() => {
    const typeMap = new Map<string, number>();
    for (const a of assets) {
      typeMap.set(a.type, (typeMap.get(a.type) ?? 0) + a.amount);
    }
    return Array.from(typeMap.entries()).map(([type, value]) => ({
      name:
        type === "CASH"
          ? "預金・現金"
          : type === "INVESTMENT"
            ? "投資信託・証券"
            : type === "CRYPTO"
              ? "暗号資産"
              : type === "POINT"
                ? "ポイント"
                : type,
      value,
      fill: assetColors[type as keyof typeof assetColors] ?? "#6b7280",
    }));
  }, [assets]);

  // 負債の pie chart データ
  const liabilityPieData = useMemo(() => {
    return liabilities.map(l => ({
      name: l.name,
      value: l.amount,
      fill: assetColors.LIABILITY,
    }));
  }, [liabilities]);

  const totalAssetValue = assetPieData.reduce((s, d) => s + d.value, 0);
  const totalLiabilityValue = liabilityPieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      {/* 概要 KPI */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-zinc-400 mb-1">総資産</p>
            <div className="text-2xl sm:text-3xl font-bold text-blue-400 font-mono">
              {formatCurrency(totalAssets)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-zinc-400 mb-1">総負債</p>
            <div className="text-2xl sm:text-3xl font-bold text-red-400 font-mono">
              {formatCurrency(totalLiabilities)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-zinc-400 mb-1">純資産</p>
            <div
              className={`text-2xl sm:text-3xl font-bold font-mono ${netWorth >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {formatCurrency(netWorth)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 資産・負債内訳（円グラフ + テーブル） */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 資産内訳 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium text-blue-400">
              資産内訳
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assetPieData.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="w-40 h-40 shrink-0">
                  <ChartContainer
                    config={Object.fromEntries(
                      assetPieData.map(d => [
                        d.name,
                        { label: d.name, color: d.fill },
                      ]),
                    )}
                    className="h-full w-full"
                  >
                    <PieChart>
                      <Pie
                        data={assetPieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={30}
                        outerRadius={65}
                        strokeWidth={2}
                        stroke="oklch(0.19 0.01 285)"
                      >
                        {assetPieData.map(entry => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        wrapperStyle={{ zIndex: 100 }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0];
                          return (
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50">
                              <div className="mb-1 text-[10px] text-zinc-400">
                                {String(item.name ?? "")}
                              </div>
                              <div className="font-mono text-sm font-bold text-zinc-100">
                                {formatCurrency(Number(item.value ?? 0))}
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ChartContainer>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[180px]">
                  {assetPieData
                    .sort((a, b) => b.value - a.value)
                    .map(item => {
                      const pct =
                        totalAssetValue > 0
                          ? ((item.value / totalAssetValue) * 100).toFixed(1)
                          : "0";
                      return (
                        <div
                          key={item.name}
                          className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="text-sm text-zinc-300 truncate flex-1">
                            {item.name}
                          </span>
                          <span className="font-mono text-sm text-zinc-100 font-medium">
                            {formatCurrency(item.value)}
                          </span>
                          <span className="font-mono text-xs text-zinc-500 shrink-0">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-4">
                資産データがありません
              </p>
            )}
          </CardContent>
        </Card>

        {/* 負債内訳 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium text-red-400">
              負債内訳
            </CardTitle>
          </CardHeader>
          <CardContent>
            {liabilityPieData.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="w-40 h-40 shrink-0">
                  <ChartContainer
                    config={{
                      liability: {
                        label: "負債",
                        color: assetColors.LIABILITY,
                      },
                    }}
                    className="h-full w-full"
                  >
                    <PieChart>
                      <Pie
                        data={liabilityPieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={30}
                        outerRadius={65}
                        strokeWidth={2}
                        stroke="oklch(0.19 0.01 285)"
                        label={({ name, percent }) =>
                          `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                        }
                      >
                        {liabilityPieData.map(entry => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        wrapperStyle={{ zIndex: 100 }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0];
                          return (
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50">
                              <div className="mb-1 text-[10px] text-zinc-400">
                                {String(item.name ?? "")}
                              </div>
                              <div className="font-mono text-sm font-bold text-zinc-100">
                                {formatCurrency(Number(item.value ?? 0))}
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ChartContainer>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[180px]">
                  {liabilityPieData
                    .sort((a, b) => b.value - a.value)
                    .map(item => {
                      const pct =
                        totalLiabilityValue > 0
                          ? ((item.value / totalLiabilityValue) * 100).toFixed(
                              1,
                            )
                          : "0";
                      return (
                        <div
                          key={item.name}
                          className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="text-sm text-zinc-300 truncate flex-1">
                            {item.name}
                          </span>
                          <span className="font-mono text-sm text-zinc-100 font-medium">
                            {formatCurrency(item.value)}
                          </span>
                          <span className="font-mono text-xs text-zinc-500 shrink-0">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-4">
                負債データがありません
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 資産詳細テーブル（投資信託の評価損益含む） */}
      {assets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium text-zinc-200">
              資産詳細
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">名称</TableHead>
                    <TableHead className="w-[140px]">金融機関</TableHead>
                    <TableHead className="text-right">カテゴリ</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="text-right">割合</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map(a => {
                    const pct =
                      totalAssets > 0
                        ? ((a.amount / totalAssets) * 100).toFixed(1)
                        : "0";
                    return (
                      <TableRow key={a.name}>
                        <TableCell className="font-medium text-zinc-200 truncate max-w-[140px]">
                          {a.name}
                          {a.holdings && a.holdings.length > 0 && (
                            <div className="text-xs text-zinc-500 mt-0.5">
                              {a.holdings.length} 銘柄
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-sm truncate max-w-[140px]">
                          {a.account}
                        </TableCell>
                        <TableCell>
                          <span
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-1 py-0 text-[9px]"
                            style={{
                              borderColor: `${assetColors[a.type]}40`,
                              backgroundColor: `${assetColors[a.type]}15`,
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: assetColors[a.type] }}
                            />
                            {a.type === "CASH"
                              ? "預金・現金"
                              : a.type === "INVESTMENT"
                                ? "投資信託・証券"
                                : a.type === "CRYPTO"
                                  ? "暗号資産"
                                  : "ポイント"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-zinc-100">
                          {formatCurrency(a.amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-300">
                          {pct}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 投資信託・証券の詳細（評価損益表示） */}
      {assets.some(a => a.holdings && a.holdings.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-200">
              <span className="h-4 w-4 text-violet-500">★</span>
              投資信託・証券詳細
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">銘柄名</TableHead>
                    <TableHead className="w-[100px]">口座</TableHead>
                    <TableHead className="text-right">保有数</TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none hover:text-zinc-100 transition-colors"
                      onClick={() => handleSort("valuation")}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        評価額
                        {sortConfig.key === "valuation" &&
                          (sortConfig.direction === "desc" ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronUp className="h-3 w-3" />
                          ))}
                      </span>
                    </TableHead>
                    <TableHead className="text-right">評価損益</TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none hover:text-zinc-100 transition-colors"
                      onClick={() => handleSort("gainLossRate")}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        損益率
                        {sortConfig.key === "gainLossRate" &&
                          (sortConfig.direction === "desc" ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronUp className="h-3 w-3" />
                          ))}
                      </span>
                    </TableHead>
                    <TableHead className="text-right">前日比</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map(h => (
                    <TableRow key={h.name}>
                      <TableCell className="font-medium text-zinc-200">
                        {h.name}
                      </TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {h.account}
                      </TableCell>
                      <TableCell className="text-right font-mono text-zinc-300">
                        {h.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-zinc-100">
                        {formatCurrency(h.valuation)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${h.gainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {h.gainLoss >= 0 && "+"}
                        {h.gainLoss.toLocaleString()} 円
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${h.gainLossRate >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {h.gainLossRate >= 0 && "+"}
                        {h.gainLossRate.toFixed(2)}%
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${h.dayBeforeRatio != null && h.dayBeforeRatio >= 0 ? "text-emerald-400" : "text-zinc-500"}`}
                      >
                        {h.dayBeforeRatio != null
                          ? `${h.dayBeforeRatio >= 0 ? "+" : ""}${h.dayBeforeRatio.toLocaleString()}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* バランスシート（積み上げ棒グラフ） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium text-zinc-200">
            バランスシート
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            <ChartContainer
              config={{
                cash: { label: "預金・現金", color: "#3b82f6" },
                investment: { label: "投資信託・証券", color: "#8b5cf6" },
                crypto: { label: "暗号資産", color: "#f59e0b" },
                point: { label: "ポイント", color: "#10b981" },
                liability: { label: "負債", color: "#ef4444" },
              }}
              className="h-full w-full"
            >
              <BarChart
                data={[
                  {
                    name: "資産",
                    CASH:
                      assets
                        .filter(a => a.type === "CASH")
                        .reduce((s, a) => s + a.amount, 0) || undefined,
                    INVESTMENT:
                      assets
                        .filter(a => a.type === "INVESTMENT")
                        .reduce((s, a) => s + a.amount, 0) || undefined,
                    CRYPTO:
                      assets
                        .filter(a => a.type === "CRYPTO")
                        .reduce((s, a) => s + a.amount, 0) || undefined,
                    POINT:
                      assets
                        .filter(a => a.type === "POINT")
                        .reduce((s, a) => s + a.amount, 0) || undefined,
                    LIABILITY: undefined,
                  },
                  ...(liabilities.length > 0
                    ? [
                        {
                          name: "負債",
                          CASH: undefined,
                          INVESTMENT: undefined,
                          CRYPTO: undefined,
                          POINT: undefined,
                          LIABILITY: -totalLiabilities || undefined,
                        },
                      ]
                    : []),
                ]}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#27272a"
                />
                <XAxis
                  dataKey="name"
                  stroke="#52525b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#52525b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={value => formatCurrency(Number(value))}
                  width={70}
                  domain={([dataMin, dataMax]: readonly [number, number]) => {
                    if (liabilities.length > 0) {
                      return [
                        Math.min(0, dataMin - totalLiabilities * 0.2),
                        dataMax,
                      ] as const;
                    }
                    return [0, dataMax] as const;
                  }}
                />
                <ChartTooltip
                  wrapperStyle={{ zIndex: 100 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const date = payload[0]?.payload?.name;
                    const isAssetBar = date === "資産";
                    const labelMap: Record<string, string> = {
                      CASH: "預金・現金",
                      INVESTMENT: "投資信託・証券",
                      CRYPTO: "暗号資産",
                      POINT: "ポイント",
                      LIABILITY: "負債",
                    };
                    return (
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50">
                        <div className="mb-1.5 text-[10px] text-zinc-400">
                          {date ?? ""}
                        </div>
                        <div className="space-y-1">
                          {payload
                            .filter(item => {
                              if (isAssetBar) {
                                return item.name !== "LIABILITY";
                              }
                              return item.name === "LIABILITY";
                            })
                            .map(item => (
                              <div
                                key={String(item.dataKey)}
                                className="flex items-center justify-between gap-4 text-xs"
                              >
                                <span className="flex items-center gap-1.5 text-zinc-300">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  {labelMap[String(item.name)] ??
                                    String(item.name)}
                                </span>
                                <span className="font-mono font-bold text-zinc-100">
                                  {formatCurrency(Number(item.value ?? 0))}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  }}
                />
                {/* 資産系列（積み上げ・正方向） */}
                <Bar
                  dataKey="CASH"
                  stackId="assets"
                  fill="var(--color-cash)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="INVESTMENT"
                  stackId="assets"
                  fill="var(--color-investment)"
                />
                <Bar
                  dataKey="CRYPTO"
                  stackId="assets"
                  fill="var(--color-crypto)"
                />
                <Bar
                  dataKey="POINT"
                  stackId="assets"
                  fill="var(--color-point)"
                  radius={[0, 0, 4, 4]}
                />
                {/* 負債系列（負方向） */}
                {liabilities.length > 0 && (
                  <Bar
                    dataKey="LIABILITY"
                    fill="var(--color-liability)"
                    radius={[4, 4, 0, 0]}
                  />
                )}
                {/* 純資産ライン */}
                <ReferenceLine
                  y={netWorth}
                  stroke={netWorth >= 0 ? "#10b981" : "#ef4444"}
                  strokeDasharray="5 3"
                  label={{
                    value: `純資産 ${formatCurrency(netWorth)}`,
                    position: "right",
                    fill: netWorth >= 0 ? "#10b981" : "#ef4444",
                    fontSize: 12,
                  }}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
