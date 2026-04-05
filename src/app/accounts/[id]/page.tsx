import {
  ArrowLeft,
  Coins,
  CreditCard,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccountDetail } from "@/actions/accounts";
import { AccountSubAccountManager } from "@/components/account-sub-account-manager";
import { AccountBalanceChart } from "@/components/accounts/account-balance-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatJSTDate,
  formatPercent,
  formatSignedAmount,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * balanceHistory から日次残高データを取得する（逆算しない）。
 */
function getBalanceHistoryData(
  histories: Array<{ date: Date; balance: number }>,
): Array<{ date: string; balance: number }> {
  const historyMap = new Map<string, number>();
  for (const h of histories) {
    const dateStr = formatJSTDate(h.date);
    historyMap.set(dateStr, h.balance);
  }
  return Array.from(historyMap.entries())
    .map(([date, balance]) => ({ date, balance }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 複数のSubAccountの日次残高データを合算して合計チャートデータを生成する。
 * データがない日は直前の既知の残高を使用して補完する。
 */
function computeTotalChartData(
  subAccountChartData: Array<{
    id: string;
    assetType: string;
    data: Array<{ date: string; balance: number }>;
  }>,
): Array<{ date: string; balance: number }> {
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

  const result: Array<{ date: string; balance: number }> = [];
  const lastKnownBalances = new Array(subAccountChartData.length).fill(0);

  for (const date of sortedDates) {
    let total = 0;
    for (let i = 0; i < balanceMaps.length; i++) {
      const balance = balanceMaps[i].get(date);
      if (balance !== undefined) {
        lastKnownBalances[i] = balance;
      }
      total += lastKnownBalances[i];
    }
    result.push({ date, balance: total });
  }

  return result;
}

/**
 * 口座詳細ページコンポーネントである．
 * ガイドブック:
 *   - タイトルにデータ種別を明記（「残高推移（日次）」）
 *   - 全体→部分: 合計残高 → チャート → 子口座一覧 → 明細
 *   - 不要な装飾を排除
 */
export default async function AccountDetailPage({ params }: Props) {
  const { id } = await params;
  const account = await getAccountDetail(id);

  if (!account) {
    notFound();
  }

  const totalBalance = account.subAccounts.reduce(
    (sum, sa) => sum + sa.balance,
    0,
  );

  const allHoldings = account.subAccounts.flatMap(sa => sa.holdings);
  const allCryptos = account.subAccounts.flatMap(sa => sa.cryptos);

  const subAccountChartData = account.subAccounts.map(sa => {
    const chartData = getBalanceHistoryData(sa.histories ?? []);
    return { id: sa.id, assetType: sa.assetType, data: chartData };
  });

  const totalChartData = computeTotalChartData(subAccountChartData);

  const chartSeries = [
    {
      id: "total",
      name: "合計",
      currentBalance: totalBalance,
      data: totalChartData,
      assetType: account.subAccounts[0]?.assetType,
    },
    ...account.subAccounts.map((sa, index) => ({
      id: sa.id,
      name: sa.currentName,
      currentBalance: sa.balance,
      data: subAccountChartData[index].data,
      assetType: sa.assetType,
    })),
  ];

  const defaultAssetType = account.subAccounts[0]?.assetType ?? "CASH";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ヘッダー: シンプルに */}
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
            {account.provider.name} · {account.subAccounts.length} 子口座
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
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">銘柄名</th>
                    <th className="text-right whitespace-nowrap">保有数</th>
                    <th className="text-right whitespace-nowrap">平均取得単価</th>
                    <th className="text-right whitespace-nowrap">基準価額</th>
                    <th className="text-right whitespace-nowrap">評価額</th>
                    <th className="text-right whitespace-nowrap">前日比</th>
                    <th className="text-right whitespace-nowrap">評価損益</th>
                    <th className="text-right whitespace-nowrap">損益率</th>
                  </tr>
                </thead>
                <tbody>
                  {allHoldings.map(h => (
                    <tr key={h.id}>
                      <td className="font-medium text-zinc-200">{h.name}</td>
                      <td className="text-right font-mono text-zinc-300">
                        {h.quantity.toLocaleString()}
                      </td>
                      <td className="text-right font-mono text-zinc-300">
                        {formatCurrency(h.avgCostBasis)}
                      </td>
                      <td className="text-right font-mono text-zinc-300">
                        {formatCurrency(h.unitPrice)}
                      </td>
                      <td className="text-right font-mono font-medium text-zinc-100">
                        {formatCurrency(h.valuation)}
                      </td>
                      <td
                        className={`text-right font-mono ${h.dayBeforeRatio != null && h.dayBeforeRatio >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {h.dayBeforeRatio != null ? formatSignedAmount(h.dayBeforeRatio) : "N/A"}
                      </td>
                      <td
                        className={`text-right font-mono ${h.gainLoss != null && h.gainLoss >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {h.gainLoss != null ? formatSignedAmount(h.gainLoss) : "N/A"}
                      </td>
                      <td
                        className={`text-right font-mono ${h.gainLossRate != null && h.gainLossRate >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {h.gainLossRate != null ? formatPercent(h.gainLossRate) : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                      <p className="text-xs text-zinc-500 truncate">
                        {c.name}
                      </p>
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
      {account.subAccounts.filter(sa => sa.pointDetail).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold tracking-tight text-zinc-200 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            ポイント詳細
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {account.subAccounts
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
