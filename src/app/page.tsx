import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";
import type { Metadata } from "next";
import { getCurrentMonthIncomeExpense } from "@/actions/assets";
import {
  getAssetHistory,
  getDashboardKPI,
  getExpiringPoints,
} from "@/actions/dashboard";
import { getLastSyncInfo } from "@/actions/system";
import { DashboardAreaWrapper } from "@/components/dashboard/dashboard-area-wrapper";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import logger from "@/lib/logger";
import { formatCurrency, formatJSTDateTime } from "@/lib/utils";

/**
 * 常に最新のデータを表示させるため，動的レンダリングを強制する設定である．
 */
export const dynamic = "force-dynamic";

/**
 * ダッシュボードのメインページコンポーネントである．
 * ガイドブック原則:
 *   - 全体→部分の階層: KPI 指標 → 推移グラフ → 構成比 → 詳細通知
 *   - 左上に最も重要な情報を配置
 *   - 比較対象を提供（前日比）
 *   - メタ情報を記載（最終更新日時）
 */
export const metadata: Metadata = {
  title: "ダッシュボード | My Assets",
  description: "資産全体の概況と推移を表示するダッシュボード",
};

export default async function DashboardPage() {
  logger.info("🏠 Rendering DashboardPage...");

  const [kpi, history, expiringPoints, syncInfo, monthlyIncomeExpense] =
    await Promise.all([
      getDashboardKPI(),
      getAssetHistory(),
      getExpiringPoints(),
      getLastSyncInfo(),
      getCurrentMonthIncomeExpense(),
    ]);

  const chartData = history;

  const assetOnlySeries = [
    { key: "CASH", label: "預金・現金", color: "#3b82f6" },
    { key: "INVESTMENT", label: "投資信託・証券", color: "#8b5cf6" },
    { key: "CRYPTO", label: "暗号資産", color: "#f59e0b" },
    { key: "POINT", label: "ポイント", color: "#10b981" },
  ] as const;

  const totalAssets =
    kpi.byAssetType.CASH ??
    0 +
      (kpi.byAssetType.INVESTMENT ?? 0) +
      (kpi.byAssetType.CRYPTO ?? 0) +
      (kpi.byAssetType.POINT ?? 0);

  const lastSyncDate = syncInfo?.date
    ? formatJSTDateTime(new Date(syncInfo.date))
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ガイドブック: ページヘッダーにデータ更新日を明示 */}
      <PageHeader
        title="ダッシュボード"
        description="資産全体の概況と推移"
        meta={lastSyncDate ? `最終更新: ${lastSyncDate}` : undefined}
      />

      {/* ── KPI 指標エリア ──────────────────────── */}
      {/* 純資産のみ表示（総資産・総負債は削除） */}
      <div className="grid gap-4 md:grid-cols-1">
        <Card className="kpi-card" style={{ animationDelay: "0ms" }}>
          <CardContent className="pt-2 pb-1">
            <p className="text-[11px] font-medium text-zinc-400 mb-0.5">
              純資産
            </p>
            <div
              className="text-3xl sm:text-4xl font-bold text-zinc-50 font-mono"
              title={formatCurrency(kpi.netWorth)}
            >
              {formatCurrency(kpi.netWorth)}
            </div>
            {/* 前日比 – ガイドブック: 比較対象を提供する */}
            <div className="flex items-center text-xs text-muted-foreground mt-2 gap-1.5">
              {kpi.dailyChange > 0 ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : kpi.dailyChange < 0 ? (
                <ArrowDownRight className="h-4 w-4 text-red-500 shrink-0" />
              ) : (
                <Minus className="h-4 w-4 text-zinc-500 shrink-0" />
              )}
              <span
                className={
                  kpi.dailyChange > 0
                    ? "text-emerald-500 font-medium"
                    : kpi.dailyChange < 0
                      ? "text-red-500 font-medium"
                      : "text-zinc-500"
                }
              >
                {kpi.dailyChange > 0 && "+"}
                {kpi.dailyChange.toLocaleString()} 円
              </span>
              <span className="text-zinc-500">前日比</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 今月の収支 ──────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-2 pb-1">
            <p className="text-[11px] font-medium text-zinc-400 mb-0.5">
              今月の収入
            </p>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-400 font-mono">
              {formatCurrency(monthlyIncomeExpense.current.income)}
            </div>
            <div className="flex items-center text-sm text-muted-foreground mt-2.5 gap-1.5">
              {monthlyIncomeExpense.current.income -
                monthlyIncomeExpense.previous.income >=
              0 ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <span
                className={
                  monthlyIncomeExpense.current.income -
                    monthlyIncomeExpense.previous.income >=
                  0
                    ? "text-emerald-500 font-medium"
                    : "text-red-500 font-medium"
                }
              >
                {monthlyIncomeExpense.current.income -
                  monthlyIncomeExpense.previous.income >=
                  0 && "+"}
                {(
                  monthlyIncomeExpense.current.income -
                  monthlyIncomeExpense.previous.income
                ).toLocaleString()}{" "}
                円
              </span>
              <span className="text-zinc-500">前月比</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2 pb-1">
            <p className="text-[11px] font-medium text-zinc-400 mb-0.5">
              今月の支出
            </p>
            <div className="text-2xl sm:text-3xl font-bold text-red-400 font-mono">
              {formatCurrency(monthlyIncomeExpense.current.expense)}
            </div>
            <div className="flex items-center text-sm text-muted-foreground mt-2.5 gap-1.5">
              {monthlyIncomeExpense.current.expense -
                monthlyIncomeExpense.previous.expense >=
              0 ? (
                <ArrowUpRight className="h-4 w-4 text-red-500 shrink-0" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-emerald-500 shrink-0" />
              )}
              <span
                className={
                  monthlyIncomeExpense.current.expense -
                    monthlyIncomeExpense.previous.expense >=
                  0
                    ? "text-red-500 font-medium"
                    : "text-emerald-500 font-medium"
                }
              >
                {monthlyIncomeExpense.current.expense -
                  monthlyIncomeExpense.previous.expense >=
                  0 && "+"}
                {(
                  monthlyIncomeExpense.current.expense -
                  monthlyIncomeExpense.previous.expense
                ).toLocaleString()}{" "}
                円
              </span>
              <span className="text-zinc-500">前月比</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2 pb-1">
            <p className="text-[11px] font-medium text-zinc-400 mb-0.5">
              今月の収支
            </p>
            <div
              className={`text-2xl sm:text-3xl font-bold font-mono ${monthlyIncomeExpense.current.balance >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {formatCurrency(monthlyIncomeExpense.current.balance)}
            </div>
            <div className="flex items-center text-sm text-muted-foreground mt-2.5 gap-1.5">
              {monthlyIncomeExpense.current.balance -
                monthlyIncomeExpense.previous.balance >=
              0 ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <span
                className={
                  monthlyIncomeExpense.current.balance -
                    monthlyIncomeExpense.previous.balance >=
                  0
                    ? "text-emerald-500 font-medium"
                    : "text-red-500 font-medium"
                }
              >
                {monthlyIncomeExpense.current.balance -
                  monthlyIncomeExpense.previous.balance >=
                  0 && "+"}
                {(
                  monthlyIncomeExpense.current.balance -
                  monthlyIncomeExpense.previous.balance
                ).toLocaleString()}{" "}
                円
              </span>
              <span className="text-zinc-500">前月比</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── グラフエリア ────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* 資産推移（積み上げ面グラフ） */}
        <Card className="col-span-1 lg:col-span-5 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-zinc-200">
              資産推移（積み上げ・月次）
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-0 sm:pl-2">
            <DashboardAreaWrapper data={chartData} />
          </CardContent>
        </Card>
      </div>

      {/* ── 資産構成詳細 ────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium text-zinc-200">
            資産構成詳細
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>カテゴリ</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead className="text-right">比率</TableHead>
                <TableHead className="text-right">前日</TableHead>
                <TableHead className="text-right">1週間</TableHead>
                <TableHead className="text-right">1カ月</TableHead>
                <TableHead className="text-right">1年</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const history = chartData;
                const now = new Date();
                const oneWeekAgo = new Date(now);
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                const oneMonthAgo = new Date(now);
                oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                const oneYearAgo = new Date(now);
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

                const findValue = (date: Date, key: string) => {
                  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  const entry = history.find(h => h.date === dateStr);
                  return entry ? (entry[key as keyof typeof entry] ?? 0) : 0;
                };

                const diff = (nowVal: number, agoVal: number) => {
                  const d = nowVal - agoVal;
                  const p =
                    agoVal !== 0 ? ((d / agoVal) * 100).toFixed(2) : "0.00";
                  return { num: d, pct: p };
                };

                return assetOnlySeries.map(s => {
                  const current = kpi.byAssetType[s.key] ?? 0;
                  const pct =
                    totalAssets > 0
                      ? ((current / totalAssets) * 100).toFixed(1)
                      : "0";
                  const yesterday = kpi.yesterdayByType?.[s.key] ?? 0;
                  const yd = diff(current, yesterday);
                  const weekAgo = Number(findValue(oneWeekAgo, s.key)) ?? 0;
                  const wk = diff(current, weekAgo);
                  const monthAgo = Number(findValue(oneMonthAgo, s.key)) ?? 0;
                  const mo = diff(current, monthAgo);
                  const yearAgo = Number(findValue(oneYearAgo, s.key)) ?? 0;
                  const yr = diff(current, yearAgo);

                  return (
                    <TableRow key={s.key}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="text-sm text-zinc-200 truncate">
                            {s.label}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium text-zinc-100">
                        {formatCurrency(current)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-zinc-300">
                        {pct}%
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span
                          className={
                            yd.num >= 0 ? "text-emerald-400" : "text-red-400"
                          }
                        >
                          {yd.num >= 0 && "+"}
                          {yd.num.toLocaleString()}
                        </span>
                        <span className="text-zinc-500 ml-0.5">
                          ({yd.num >= 0 && "+"}
                          {yd.pct}%)
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span
                          className={
                            wk.num >= 0 ? "text-emerald-400" : "text-red-400"
                          }
                        >
                          {wk.num >= 0 && "+"}
                          {wk.num.toLocaleString()}
                        </span>
                        <span className="text-zinc-500 ml-0.5">
                          ({wk.num >= 0 && "+"}
                          {wk.pct}%)
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span
                          className={
                            mo.num >= 0 ? "text-emerald-400" : "text-red-400"
                          }
                        >
                          {mo.num >= 0 && "+"}
                          {mo.num.toLocaleString()}
                        </span>
                        <span className="text-zinc-500 ml-0.5">
                          ({mo.num >= 0 && "+"}
                          {mo.pct}%)
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span
                          className={
                            yr.num >= 0 ? "text-emerald-400" : "text-red-400"
                          }
                        >
                          {yr.num >= 0 && "+"}
                          {yr.num.toLocaleString()}
                        </span>
                        <span className="text-zinc-500 ml-0.5">
                          ({yr.num >= 0 && "+"}
                          {yr.pct}%)
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── ポイント期限通知 ───────────────────── */}
      {expiringPoints.length > 0 && (
        <Card className="border-amber-900/50 bg-amber-950/10 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-500">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              期限切れ間近のポイント
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiringPoints.map(p => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-amber-900/30 pb-3 last:border-0 last:pb-0 gap-2"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-zinc-200 truncate text-sm">
                      {p.subAccount.mainAccount.label}
                    </span>
                    <span className="text-xs text-zinc-500 truncate">
                      {p.subAccount.currentName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:block sm:text-right w-full sm:w-auto">
                    <div className="text-amber-400 font-mono text-base font-bold">
                      {p.points.toLocaleString()} pt
                    </div>
                    <div className="text-xs text-amber-600">
                      あと{" "}
                      {p.expirationDate
                        ? Math.ceil(
                            (p.expirationDate.getTime() - Date.now()) /
                              (1000 * 60 * 60 * 24),
                          )
                        : "?"}{" "}
                      日
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
