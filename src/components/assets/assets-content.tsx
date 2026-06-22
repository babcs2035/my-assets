"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  YAxis,
} from "recharts";
import { HoldingTable } from "@/components/accounts/holding-table";
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

  const holdings = useMemo(
    () =>
      assets.flatMap(a =>
        (a.holdings ?? []).map(h => ({
          ...h,
          id: h.id,
          account: a.account,
        })),
      ),
    [assets],
  );

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

  // 負債の pie chart データ（絶対値で扱う）
  const liabilityPieData = useMemo(() => {
    return liabilities.map(l => ({
      name: l.name,
      value: Math.abs(l.amount),
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
            <div className="text-3xl font-bold text-blue-400 font-mono tracking-tight">
              {formatCurrency(totalAssets)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-zinc-400 mb-1">総負債</p>
            <div className="text-3xl font-bold text-red-400 font-mono tracking-tight">
              {formatCurrency(totalLiabilities)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-zinc-400 mb-1">純資産</p>
            <div
              className={`text-3xl font-bold font-mono tracking-tight ${netWorth >= 0 ? "text-emerald-400" : "text-red-400"}`}
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
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50">
                              <div className="mb-1.5 text-sm text-zinc-400">
                                {String(item.name ?? "")}
                              </div>
                              <div className="font-mono text-base font-bold text-zinc-100">
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
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50">
                              <div className="mb-1.5 text-sm text-zinc-400">
                                {String(item.name ?? "")}
                              </div>
                              <div className="font-mono text-base font-bold text-zinc-100">
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
                    <TableHead>名称</TableHead>
                    <TableHead>金融機関</TableHead>
                    <TableHead>カテゴリ</TableHead>
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
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-[11px]"
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
            <CardTitle className="text-base font-medium text-zinc-200">
              投資信託・証券詳細
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <HoldingTable holdings={holdings} />
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
                totalAssets: { label: "総資産", color: "#3b82f6" },
                netWorth: { label: "純資産", color: "#10b981" },
                totalLiability: { label: "総負債", color: "#ef4444" },
              }}
              className="h-full w-full"
            >
              <BarChart
                data={[
                  { totalAssets: totalAssets > 0 ? totalAssets : undefined },
                  {
                    totalLiability:
                      totalLiabilities < 0
                        ? Math.abs(totalLiabilities)
                        : undefined,
                    netWorth: netWorth > 0 ? netWorth : undefined,
                  },
                ]}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#27272a"
                />
                <YAxis
                  stroke="#52525b"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={value => formatCurrency(Number(value))}
                  width={70}
                  domain={[0, totalAssets > 0 ? totalAssets : 1000000]}
                />
                <ChartTooltip
                  wrapperStyle={{ zIndex: 100 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50">
                        <div className="space-y-1.5">
                          {payload.map(item => (
                            <div
                              key={String(item.dataKey)}
                              className="flex items-center justify-between gap-4 text-sm"
                            >
                              <span className="flex items-center gap-1.5 text-zinc-300">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                {item.dataKey === "totalAssets"
                                  ? "総資産"
                                  : item.dataKey === "netWorth"
                                    ? "純資産"
                                    : item.dataKey === "totalLiability"
                                      ? "総負債"
                                      : String(item.dataKey)}
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
                {/* 左 bar: 総資産 */}
                <Bar
                  dataKey="totalAssets"
                  fill="var(--color-totalAssets)"
                  radius={[4, 4, 0, 0]}
                />
                {/* 右 bar: 純資産（下端） + 総負債（其上） */}
                {netWorth > 0 && (
                  <Bar
                    dataKey="netWorth"
                    stackId="assets"
                    fill="var(--color-netWorth)"
                    radius={[4, 4, 0, 0]}
                  />
                )}
                {totalLiabilities < 0 && (
                  <Bar
                    dataKey="totalLiability"
                    stackId="assets"
                    fill="var(--color-totalLiability)"
                    radius={[0, 0, 4, 4]}
                  />
                )}
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
