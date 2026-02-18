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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  assetTypeColor,
  assetTypeLabel,
  formatCurrency,
  formatPercent,
  formatSignedAmount,
} from "@/lib/utils";

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
        <div className="text-right">
          <p className="text-xs text-zinc-500">合計残高</p>
          <p className="text-3xl font-bold tracking-tight text-zinc-50">
            {formatCurrency(totalBalance)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">全子口座合算</TabsTrigger>
          {account.subAccounts.map(sa => (
            <TabsTrigger key={sa.id} value={sa.id}>
              {sa.currentName}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* All Sub Accounts Tab */}
        <TabsContent value="all" className="space-y-6">
          <AccountSubAccountManager
            subAccounts={account.subAccounts}
            mainAccountId={account.id}
          />

          {/* Holdings Table */}
          {allHoldings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-violet-500" />
                  投資信託・証券
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>銘柄名</th>
                        <th className="text-right">保有数</th>
                        <th className="text-right">平均取得単価</th>
                        <th className="text-right">基準価額</th>
                        <th className="text-right">評価額</th>
                        <th className="text-right">前日比</th>
                        <th className="text-right">評価損益</th>
                        <th className="text-right">損益率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allHoldings.map(h => (
                        <tr key={h.id}>
                          <td className="font-medium text-zinc-200">
                            {h.name}
                          </td>
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
                  暗号資産
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
                        <div>
                          <p className="text-lg font-bold text-zinc-100">
                            {c.symbol}
                          </p>
                          <p className="text-xs text-zinc-500">{c.name}</p>
                        </div>
                        <Badge
                          variant={
                            c.dayBeforeRatio && c.dayBeforeRatio >= 0
                              ? "outline"
                              : "destructive"
                          }
                          className={
                            c.dayBeforeRatio && c.dayBeforeRatio >= 0
                              ? "border-success/50 text-success"
                              : ""
                          }
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
        </TabsContent>

        {/* Individual Sub Account Tabs */}
        {account.subAccounts.map(sa => (
          <TabsContent key={sa.id} value={sa.id} className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">
                      {assetTypeLabel(sa.assetType)}
                    </p>
                    <p className="mt-1 text-3xl font-bold text-zinc-50">
                      {formatCurrency(sa.balance)}
                    </p>
                  </div>
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: assetTypeColor(sa.assetType) }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Sub account specific holdings */}
            {sa.holdings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">投資信託銘柄</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>銘柄名</th>
                          <th className="text-right">保有数</th>
                          <th className="text-right">評価額</th>
                          <th className="text-right">評価損益</th>
                          <th className="text-right">損益率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sa.holdings.map(h => (
                          <tr key={h.id}>
                            <td className="text-zinc-200">{h.name}</td>
                            <td className="text-right font-mono text-zinc-300">
                              {h.quantity.toLocaleString()}
                            </td>
                            <td className="text-right font-mono text-zinc-100">
                              {formatCurrency(h.valuation)}
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

            {/* Sub account specific cryptos */}
            {sa.cryptos.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">暗号資産</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {sa.cryptos.map(c => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4"
                      >
                        <p className="text-lg font-bold text-zinc-100">
                          {c.quantity.toLocaleString()} {c.symbol}
                        </p>
                        <p className="text-sm text-zinc-400">
                          {formatCurrency(c.valuation)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Point detail */}
            {sa.pointDetail && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4 text-emerald-400" />
                    ポイント詳細
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">ポイント数</span>
                      <span className="font-mono text-zinc-100">
                        {sa.pointDetail.points.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">換算レート</span>
                      <span className="font-mono text-zinc-300">
                        ×{sa.pointDetail.rate}
                      </span>
                    </div>
                    {sa.pointDetail.expirationDate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">有効期限</span>
                        <span className="text-zinc-300">
                          {
                            sa.pointDetail.expirationDate
                              .toISOString()
                              .split("T")[0]
                          }
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
