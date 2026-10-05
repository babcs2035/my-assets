"use client";

import { ArrowLeft, Coins, CreditCard, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  getAccountDetail,
  type getCreditCardBillings,
} from "@/actions/accounts";
import { AccountSubAccountManager } from "@/components/account-sub-account-manager";
import { AccountBalanceChart } from "@/components/accounts/account-balance-chart";
import { CreditCardBillingSection } from "@/components/accounts/credit-card-billing-section";
import { HoldingTable } from "@/components/accounts/holding-table";
import { HoldingTrendChart } from "@/components/accounts/holding-trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatJSTDate } from "@/lib/utils";

/**
 * 口座詳細ページのコンテンツコンポーネントである．
 * サーバーで取得した口座データを受け取り，チャートやサブアカウントマネージャーに渡す．
 */
export function AccountDetailPageContent({
  initialAccount,
  billings,
}: {
  initialAccount: NonNullable<Awaited<ReturnType<typeof getAccountDetail>>>;
  billings: Awaited<ReturnType<typeof getCreditCardBillings>>;
}) {
  const [account, setAccount] = useState(initialAccount);

  // 子口座の非表示・資産区分・並び順を変えたあとに，口座データだけを取り直す．
  // useState の初期値はサーバーの再描画 (router.refresh()) では差し替わらないため，
  // ここで取り直さないとグラフと合計に反映されない (ACC-2)
  const refreshAccount = useCallback(async () => {
    try {
      const latest = await getAccountDetail(initialAccount.id);
      // 管理画面を開いている間に口座が消えた場合は，表示中のデータを残す
      if (latest) {
        setAccount(latest);
      }
    } catch {
      toast.error(
        "最新の口座データを取得できませんでした．再読み込みしてください．",
      );
    }
  }, [initialAccount.id]);

  return (
    <AccountDetailContent
      account={account}
      billings={billings}
      onSubAccountsChanged={refreshAccount}
    />
  );
}

/**
 * 口座詳細ページの実コンテンツである．
 */
function AccountDetailContent({
  account,
  billings,
  onSubAccountsChanged,
}: {
  account: NonNullable<Awaited<ReturnType<typeof getAccountDetail>>>;
  billings: Awaited<ReturnType<typeof getCreditCardBillings>>;
  onSubAccountsChanged: () => Promise<void>;
}) {
  const visibleSubAccounts = account.subAccounts.filter(sa => !sa.isHidden);

  const totalBalance = visibleSubAccounts.reduce(
    (sum, sa) => sum + sa.balance,
    0,
  );

  const allHoldings = visibleSubAccounts.flatMap(sa =>
    (sa.holdings ?? []).map(h => ({
      ...h,
      account: sa.mainAccount.label,
      acquisitionCost: h.valuation - h.gainLoss,
    })),
  );

  const allCryptos = visibleSubAccounts.flatMap(sa => sa.cryptos);

  // 全 subAccount の holdingHistories を銘柄名でグループ化
  type HistGroup = {
    name: string;
    valuation: number;
    unitPrice: number | null;
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
    unitPrice: number | null;
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
      unitPrice: h.unitPrice,
      valuation: h.valuation,
      gainLoss: h.gainLoss,
      gainLossRate: h.gainLossRate,
      dayBeforeRatio: h.dayBeforeRatio,
      holdingHistories,
    });
  }

  // 売却した銘柄（今の保有にない銘柄）の履歴．銘柄推移の合計にだけ使う (ACC-9)
  const soldHoldingHistories: HistGroup[][] = [];
  for (const [subAccountId, grouped] of historiesBySubAccount) {
    for (const [name, histories] of grouped) {
      const isHeld = allHoldings.some(
        h => h.subAccountId === subAccountId && h.name === name,
      );
      if (!isHeld) soldHoldingHistories.push(histories);
    }
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
      // 先頭の子口座の種類で色を決めると，預金と証券が混ざった口座でも先頭次第で色が変わる．
      // 種類が 1 つに揃うときだけその色を使い，混在時は defaultAssetType に任せる (ACC-19)
      assetType: visibleSubAccounts.every(
        sa => sa.assetType === visibleSubAccounts[0]?.assetType,
      )
        ? visibleSubAccounts[0]?.assetType
        : undefined,
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
        {/* Link の中に button を入れると，フォーカスが 2 回止まり，リンクとボタンが入れ子になる (ACC-10) */}
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link href="/accounts" aria-label="口座一覧に戻る">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          {/* truncate は flex コンテナ（h1）では効かないため，内側の span に付与する */}
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">
            <span className="truncate">{account.label}</span>
          </h1>
        </div>
      </div>

      {/* チャートパネル */}
      <div className="w-full">
        <AccountBalanceChart
          series={chartSeries}
          defaultAssetType={defaultAssetType}
        />
      </div>

      {/* クレジットカード請求履歴 */}
      {billings.length > 0 && <CreditCardBillingSection billings={billings} />}

      {/* 子口座一覧 */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-200">
          子口座一覧
        </h2>
        <AccountSubAccountManager
          subAccounts={account.subAccounts}
          mainAccountId={account.id}
          onSubAccountsChanged={onSubAccountsChanged}
        />
      </div>

      {/* 投資信託銘柄推移 */}
      {chartHoldings.length > 0 && (
        <HoldingTrendChart
          holdings={chartHoldings}
          soldHoldings={soldHoldingHistories}
        />
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
                      <p className="text-xs text-zinc-400 truncate">{c.name}</p>
                    </div>
                    {/* dayBeforeRatio が 0 のときも正しく表示するため null 判定を使う
                        （falsy 判定だと 0% が「N/A」+ 赤字バッジになる） */}
                    <Badge
                      variant={
                        c.dayBeforeRatio == null
                          ? "secondary"
                          : c.dayBeforeRatio >= 0
                            ? "outline"
                            : "destructive"
                      }
                      className={`shrink-0 ${
                        c.dayBeforeRatio != null && c.dayBeforeRatio >= 0
                          ? "border-success/50 text-success"
                          : ""
                      }`}
                    >
                      {c.dayBeforeRatio != null
                        ? `${c.dayBeforeRatio >= 0 ? "+" : ""}${c.dayBeforeRatio.toLocaleString("ja-JP")}%`
                        : "N/A"}
                    </Badge>
                  </div>
                  <div className="mt-2.5 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">数量</span>
                      <span className="font-mono text-zinc-300">
                        {/* 暗号資産の数量は小数点多目が必要なため桁数を拡大する */}
                        {c.quantity.toLocaleString("ja-JP", {
                          maximumFractionDigits: 8,
                        })}{" "}
                        {c.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">レート</span>
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
          <h2 className="text-lg font-bold tracking-tight text-zinc-200 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            ポイント詳細
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {visibleSubAccounts
              .filter(sa => sa.pointDetail)
              .map(sa => (
                <Card key={sa.id}>
                  <CardHeader className="pb-2">
                    {/* 「ポイント詳細」（h2）の下に並ぶカードなので h3 にする */}
                    <CardTitle
                      asChild
                      className="text-sm tracking-tight text-zinc-200"
                    >
                      <h3>{sa.currentName}</h3>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">ポイント数</span>
                        <span className="font-mono text-zinc-100 font-medium">
                          {sa.pointDetail?.points.toLocaleString("ja-JP")}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">換算レート</span>
                        <span className="font-mono text-zinc-400">
                          ×{sa.pointDetail?.rate}
                        </span>
                      </div>
                      {sa.pointDetail?.expirationDate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-400">有効期限</span>
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
