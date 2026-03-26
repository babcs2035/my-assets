import {
  ArrowLeft,
  Building2,
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
import { formatCurrency, formatPercent, formatSignedAmount } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

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

  // 投資信託の全銘柄
  const allHoldings = account.subAccounts.flatMap(sa => sa.holdings);
  // 暗号資産の全銘柄
  const allCryptos = account.subAccounts.flatMap(sa => sa.cryptos);

  // 過去90日間の履歴データを計算
  const historyMap = new Map<string, number>();
  for (const sa of account.subAccounts) {
    if (sa.histories) {
      for (const h of sa.histories) {
        const dateStr = h.date.toISOString().split("T")[0];
        historyMap.set(dateStr, (historyMap.get(dateStr) || 0) + h.balance);
      }
    }
  }

  const totalChartData = Array.from(historyMap.entries())
    .map(([date, balance]) => ({ date, balance }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const chartSeries = [
    {
      id: "total",
      name: "合計",
      currentBalance: totalBalance,
      data: totalChartData,
    },
    ...account.subAccounts.map(sa => {
      const saData = (sa.histories || [])
        .map(h => ({
          date: h.date.toISOString().split("T")[0],
          balance: h.balance,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        id: sa.id,
        name: sa.currentName,
        currentBalance: sa.balance,
        data: saData,
      };
    }),
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/accounts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800">
              <Building2 className="h-5 w-5 text-zinc-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                {account.label}
              </h1>
              <p className="text-sm text-zinc-500">
                {account.provider.name} · {account.subAccounts.length} 子口座
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Panel */}
      <div className="w-full">
        <AccountBalanceChart series={chartSeries} />
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-zinc-400" />
          子口座一覧
        </h2>
        <AccountSubAccountManager
          subAccounts={account.subAccounts}
          mainAccountId={account.id}
        />
      </div>

      <div className="space-y-8">
        {/* Holdings Table */}
        {allHoldings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-violet-500" />
                投資信託・証券 (合算)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th className="whitespace-nowrap">銘柄名</th>
                      <th className="text-right whitespace-nowrap">保有数</th>
                      <th className="text-right whitespace-nowrap">
                        平均取得単価
                      </th>
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
                          className={`text-right font-mono ${h.dayBeforeRatio >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {formatSignedAmount(h.dayBeforeRatio)}
                        </td>
                        <td
                          className={`text-right font-mono ${h.gainLoss >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {formatSignedAmount(h.gainLoss)}
                        </td>
                        <td
                          className={`text-right font-mono ${h.gainLossRate >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {formatPercent(h.gainLossRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Crypto Assets */}
        {allCryptos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="h-4 w-4 text-warning" />
                暗号資産 (合算)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {allCryptos.map(c => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-base md:text-lg font-bold text-zinc-100 truncate">
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
                    <div className="mt-3 space-y-1">
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
      </div>

      {/* Point details and individual subaccounts breakdowns, if there are points */}
      {account.subAccounts.filter(sa => sa.pointDetail).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            ポイント詳細
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                    <div className="space-y-2">
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
                            {
                              sa.pointDetail?.expirationDate
                                .toISOString()
                                .split("T")[0]
                            }
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
