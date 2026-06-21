"use client";

import { ArrowLeft, Coins, CreditCard, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getAccountDetail } from "@/actions/accounts";
import { AccountSubAccountManager } from "@/components/account-sub-account-manager";
import { AccountBalanceChart } from "@/components/accounts/account-balance-chart";
import { HoldingTable } from "@/components/accounts/holding-table";
import { HoldingTrendChart } from "@/components/accounts/holding-trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatJSTDate, formatSignedAmount } from "@/lib/utils";

/**
 * 口座詳細ページのコンテンツコンポーネントである．
 * クライアントサイドでデータをフェッチし，チャートやサブアカウントマネージャーに渡す．
 */
export function AccountDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<Awaited<
    ReturnType<typeof getAccountDetail>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAccountDetail(id);
        if (!cancelled) setAccount(data);
      } catch {
        if (!cancelled) setError("データの取得に失敗しました．");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!account) {
    return <AccountDetailPageSkeleton />;
  }

  return <AccountDetailContent account={account} />;
}

/**
 * 口座詳細ページの実コンテンツである．
 */
function AccountDetailContent({
  account,
}: {
  account: NonNullable<Awaited<ReturnType<typeof getAccountDetail>>>;
}) {
  const visibleSubAccounts = account.subAccounts.filter(sa => !sa.isHidden);

  const totalBalance = visibleSubAccounts.reduce(
    (sum, sa) => sum + sa.balance,
    0,
  );

  const allHoldings = visibleSubAccounts.flatMap(sa =>
    (sa.holdings ?? []).map(h => ({ ...h, account: sa.mainAccount.label })),
  );

  const allCryptos = visibleSubAccounts.flatMap(sa => sa.cryptos);

  // 全 subAccount の holdingHistories を銘柄名でグループ化
  type HistGroup = {
    name: string;
    valuation: number;
    unitPrice: number;
    gainLoss: number;
    gainLossRate: number;
    date: Date | string;
  };
  const historiesBySubAccount = new Map<string, Map<string, HistGroup[]>>();
  for (const sa of visibleSubAccounts) {
    if (!sa.holdingHistories?.length) continue;
    const grouped = new Map<string, HistGroup[]>();
    for (const hist of sa.holdingHistories) {
      const existing = grouped.get(hist.name) ?? [];
      existing.push({
        name: hist.name,
        valuation: hist.valuation,
        unitPrice: hist.unitPrice,
        gainLoss: hist.gainLoss,
        gainLossRate: hist.gainLossRate,
        date: hist.date,
      });
      grouped.set(hist.name, existing);
    }
    historiesBySubAccount.set(sa.id, grouped);
  }

  // チャート用の銘柄データ（履歴を結合）
  const chartHoldings: Array<{
    id: string;
    name: string;
    quantity: number;
    avgCostBasis: number;
    unitPrice: number;
    valuation: number;
    gainLoss: number;
    gainLossRate: number;
    dayBeforeRatio: number | null;
    holdingHistories: HistGroup[];
  }> = [];
  for (const h of allHoldings) {
    const subGrouped = historiesBySubAccount.get(h.subAccountId);
    if (!subGrouped) continue;
    const holdingHistories = subGrouped.get(h.name);
    if (!holdingHistories || holdingHistories.length === 0) continue;
    chartHoldings.push({
      id: h.id,
      name: h.name,
      quantity: h.quantity,
      avgCostBasis: h.avgCostBasis,
      unitPrice: h.unitPrice,
      valuation: h.valuation,
      gainLoss: h.gainLoss,
      gainLossRate: h.gainLossRate,
      dayBeforeRatio: h.dayBeforeRatio,
      holdingHistories,
    });
  }

  const subAccountChartData = visibleSubAccounts.map(sa => {
    const chartData = getBalanceHistoryData(sa.histories ?? [], sa.balance);
    return { id: sa.id, assetType: sa.assetType, data: chartData };
  });

  const totalChartData = computeTotalChartData(subAccountChartData);
  const hasLiabilitySubAccount = visibleSubAccounts.some(
    sa => sa.assetType === "LIABILITY",
  );

  const chartSeries = [
    {
      id: "total",
      name: "合計",
      currentBalance: totalBalance,
      data: totalChartData,
      assetType: visibleSubAccounts[0]?.assetType,
      hasLiabilitySeries: hasLiabilitySubAccount,
    },
    ...visibleSubAccounts.map((sa, index) => ({
      id: sa.id,
      name: sa.currentName,
      currentBalance: sa.balance,
      data: subAccountChartData[index].data,
      assetType: sa.assetType,
    })),
  ];

  const defaultAssetType = visibleSubAccounts[0]?.assetType ?? "CASH";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link href="/accounts">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl truncate">
            {account.label}
          </h1>
          <p className="text-sm text-zinc-500">
            {account.provider.name} · {visibleSubAccounts.length} 子口座
          </p>
        </div>
      </div>

      {/* チャートパネル */}
      <div className="w-full">
        <AccountBalanceChart
          series={chartSeries}
          defaultAssetType={defaultAssetType}
        />
      </div>

      {/* 子口座一覧 */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-200">
          子口座一覧
        </h2>
        <AccountSubAccountManager
          subAccounts={account.subAccounts}
          mainAccountId={account.id}
        />
      </div>

      {/* 投資信託銘柄推移 */}
      {chartHoldings.length > 0 && (
        <HoldingTrendChart holdings={chartHoldings} />
      )}

      {/* 投資信託テーブル */}
      {allHoldings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-200">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              投資信託・証券（合算）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <HoldingTable holdings={allHoldings} showDetails />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 暗号資産 */}
      {allCryptos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-200">
              <Coins className="h-4 w-4 text-warning" />
              暗号資産（合算）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {allCryptos.map(c => (
                <div
                  key={c.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="text-base font-bold text-zinc-100 truncate">
                        {c.symbol}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{c.name}</p>
                    </div>
                    <Badge
                      variant={
                        c.dayBeforeRatio && c.dayBeforeRatio >= 0
                          ? "outline"
                          : "destructive"
                      }
                      className={`shrink-0 ${
                        c.dayBeforeRatio && c.dayBeforeRatio >= 0
                          ? "border-success/50 text-success"
                          : ""
                      }`}
                    >
                      {c.dayBeforeRatio
                        ? formatSignedAmount(c.dayBeforeRatio)
                        : "N/A"}
                    </Badge>
                  </div>
                  <div className="mt-2.5 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">数量</span>
                      <span className="font-mono text-zinc-300">
                        {c.quantity.toLocaleString()} {c.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">レート</span>
                      <span className="font-mono text-zinc-300">
                        {formatCurrency(c.price)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-zinc-400">評価額</span>
                      <span className="font-mono text-zinc-100">
                        {formatCurrency(c.valuation)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ポイント詳細 */}
      {visibleSubAccounts.filter(sa => sa.pointDetail).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold tracking-tight text-zinc-200 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            ポイント詳細
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {visibleSubAccounts
              .filter(sa => sa.pointDetail)
              .map(sa => (
                <Card key={sa.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm tracking-tight text-zinc-200">
                      {sa.currentName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">ポイント数</span>
                        <span className="font-mono text-zinc-100 font-medium">
                          {sa.pointDetail?.points.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">換算レート</span>
                        <span className="font-mono text-zinc-400">
                          ×{sa.pointDetail?.rate}
                        </span>
                      </div>
                      {sa.pointDetail?.expirationDate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500">有効期限</span>
                          <span className="text-zinc-300">
                            {formatJSTDate(sa.pointDetail?.expirationDate)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 口座詳細ページのスケルトンローディングである．
 */
function AccountDetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/**
 * balanceHistory から日次残高データを取得する（逆算しない）．
 */
function getBalanceHistoryData(
  histories: Array<{ date: Date; balance: number }>,
  currentBalance: number,
): Array<{ date: string; balance: number }> {
  const historyMap = new Map<string, number>();
  for (const h of histories) {
    const dateStr = formatJSTDate(h.date);
    historyMap.set(dateStr, h.balance);
  }
  if (historyMap.size === 0) {
    historyMap.set(formatJSTDate(new Date()), currentBalance);
  }
  return Array.from(historyMap.entries())
    .map(([date, balance]) => ({ date, balance }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 複数のSubAccountの日次残高データを合算して合計チャートデータを生成する．
 * データがない日は直前の既知の残高を使用して補完する．
 */
function computeTotalChartData(
  subAccountChartData: Array<{
    id: string;
    assetType: string;
    data: Array<{ date: string; balance: number }>;
  }>,
): Array<{
  date: string;
  balance: number;
  assetTotal: number;
  liabilityTotal: number;
}> {
  const allDates = new Set<string>();
  for (const saData of subAccountChartData) {
    for (const d of saData.data) {
      allDates.add(d.date);
    }
  }

  if (allDates.size === 0) return [];

  const sortedDates = Array.from(allDates).sort();
  const balanceMaps = subAccountChartData.map(saData => {
    const map = new Map<string, number>();
    for (const d of saData.data) {
      map.set(d.date, d.balance);
    }
    return map;
  });

  const result: Array<{
    date: string;
    balance: number;
    assetTotal: number;
    liabilityTotal: number;
  }> = [];
  const lastKnownBalances = new Array(subAccountChartData.length).fill(0);

  for (const date of sortedDates) {
    let assetTotal = 0;
    let liabilityTotal = 0;
    for (let i = 0; i < balanceMaps.length; i++) {
      const balance = balanceMaps[i].get(date);
      if (balance !== undefined) {
        lastKnownBalances[i] = balance;
      }
      if (subAccountChartData[i].assetType === "LIABILITY") {
        liabilityTotal += lastKnownBalances[i];
      } else {
        assetTotal += lastKnownBalances[i];
      }
    }
    result.push({
      date,
      balance: assetTotal + liabilityTotal,
      assetTotal,
      liabilityTotal,
    });
  }

  return result;
}
