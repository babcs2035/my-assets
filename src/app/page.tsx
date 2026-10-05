import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  LayoutDashboard,
  Minus,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentMonthIncomeExpense } from "@/actions/assets";
import {
  getAssetHistory,
  getDashboardKPI,
  getExpiringPoints,
} from "@/actions/dashboard";
import { DashboardAreaWrapper } from "@/components/dashboard/dashboard-area-wrapper";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addDaysToDateKey } from "@/lib/daily-series";
import logger from "@/lib/logger";
import {
  formatChangeRate,
  formatCurrency,
  formatJSTDate,
  formatSignedCurrency,
  shiftUtcDateOnlyByMonths,
} from "@/lib/utils";

/**
 * 常に最新のデータを表示させるため，動的レンダリングを強制する設定である．
 */
export const dynamic = "force-dynamic";

/**
 * ダッシュボードのメインページコンポーネントである．
 * ガイドブック原則:
 *   - 全体→部分の階層: KPI 指標 → 推移グラフ → 構成比 → 詳細通知
 *   - 左上に最も重要な情報を配置
 *   - 比較対象を提供（前日比・前月比）
 */
export const metadata: Metadata = {
  title: "ダッシュボード | My Assets",
  description: "資産全体の概況と推移を表示するダッシュボード",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="ダッシュボード" icon={LayoutDashboard} />

      {/* layout で children 全体を Suspense に包むと，その内側で呼ぶ notFound() が
          HTTP 200 になる（口座詳細の soft 404）．データを待つ部分だけをページ内の Suspense に入れる */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

/**
 * ダッシュボードの KPI，推移グラフ，資産構成，ポイント期限を取得して描画する．
 */
async function DashboardContent() {
  logger.info("🏠 Rendering DashboardPage...");

  const [kpi, history, expiringPoints, monthlyIncomeExpense] =
    await Promise.all([
      getDashboardKPI(),
      getAssetHistory(),
      getExpiringPoints(),
      getCurrentMonthIncomeExpense(),
    ]);

  const chartData = history;

  // 前日比の基準が昨日でない（同期が止まっていた）ときは，数日分の変化を 1 日分と
  // 読み違えないよう「前日」ではなく基準日（MM/DD）を見出しにする (DASH-4)
  const yesterdayKey = addDaysToDateKey(formatJSTDate(new Date()), -1);
  const baselineLabel =
    kpi.baselineDateKey && kpi.baselineDateKey !== yesterdayKey
      ? kpi.baselineDateKey.slice(5).replace("-", "/")
      : "前日";

  const assetOnlySeries = [
    { key: "CASH", label: "預金・現金", color: "#3b82f6" },
    { key: "INVESTMENT", label: "投資信託・証券", color: "#8b5cf6" },
    { key: "CRYPTO", label: "暗号資産", color: "#f59e0b" },
    { key: "POINT", label: "ポイント", color: "#10b981" },
  ] as const;

  // 演算子の優先度で `+` は `??` より高いため，各項を括弧で囲む必要がある
  // （囲まないと CASH が存在する限り totalAssets は CASH のみになる）
  const totalAssets =
    (kpi.byAssetType.CASH ?? 0) +
    (kpi.byAssetType.INVESTMENT ?? 0) +
    (kpi.byAssetType.CRYPTO ?? 0) +
    (kpi.byAssetType.POINT ?? 0);

  // 前月比の表示（差が 0 の場合は中性の Minus アイコンを表示し，
  // 緑の「上昇」矢印を出さない）
  const renderMonthDiff = (diff: number, upIsGood: boolean) => {
    const upClass = upIsGood ? "text-emerald-500" : "text-red-500";
    const downClass = upIsGood ? "text-red-500" : "text-emerald-500";
    return (
      <>
        {diff > 0 ? (
          <ArrowUpRight className={`h-4 w-4 ${upClass} shrink-0`} />
        ) : diff < 0 ? (
          <ArrowDownRight className={`h-4 w-4 ${downClass} shrink-0`} />
        ) : (
          <Minus className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
        <span
          className={
            diff > 0
              ? `${upClass} font-medium`
              : diff < 0
                ? `${downClass} font-medium`
                : "text-zinc-400"
          }
        >
          {formatSignedCurrency(diff)}
        </span>
        <span className="text-zinc-400">前月同期比</span>
      </>
    );
  };

  return (
    <>
      {/* ── KPI 指標エリア ──────────────────────── */}
      {/* 純資産のみ表示（総資産・総負債は削除） */}
      <div className="grid gap-4">
        <Card className="kpi-card" style={{ animationDelay: "0ms" }}>
          <CardContent className="pt-2 pb-1">
            <p className="text-[13px] font-medium text-zinc-400 mb-0.5">
              純資産
            </p>
            <div
              className="text-2xl sm:text-3xl font-bold text-zinc-50 font-mono tracking-tight"
              title={formatCurrency(kpi.netWorth)}
            >
              {formatCurrency(kpi.netWorth)}
            </div>
            {/* 前日比 – ガイドブック: 比較対象を提供する
                （直近 7 日に記録のない表示口座がある場合は dailyChange が null になり「—」表示） */}
            <div className="flex items-center text-sm text-muted-foreground mt-2.5 gap-1.5">
              {kpi.dailyChange === null ? (
                <>
                  <span className="text-zinc-400">—</span>
                  <span className="text-zinc-400">前日比</span>
                </>
              ) : (
                <>
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
                          : "text-zinc-400"
                    }
                  >
                    {formatSignedCurrency(kpi.dailyChange)}
                  </span>
                  <span className="text-zinc-400">{baselineLabel}比</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 今月の収支 ──────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-2 pb-1">
            <p className="text-[13px] font-medium text-zinc-400 mb-0.5">
              今月の収入
            </p>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-400 font-mono">
              {formatCurrency(monthlyIncomeExpense.current.income)}
            </div>
            <div className="flex items-center text-sm text-muted-foreground mt-2.5 gap-1.5">
              {renderMonthDiff(
                monthlyIncomeExpense.current.income -
                  monthlyIncomeExpense.previous.income,
                true,
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2 pb-1">
            <p className="text-[13px] font-medium text-zinc-400 mb-0.5">
              今月の支出
            </p>
            <div className="text-2xl sm:text-3xl font-bold text-red-400 font-mono">
              {formatCurrency(monthlyIncomeExpense.current.expense)}
            </div>
            <div className="flex items-center text-sm text-muted-foreground mt-2.5 gap-1.5">
              {renderMonthDiff(
                monthlyIncomeExpense.current.expense -
                  monthlyIncomeExpense.previous.expense,
                false,
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2 pb-1">
            <p className="text-[13px] font-medium text-zinc-400 mb-0.5">
              今月の収支
            </p>
            <div
              className={`text-2xl sm:text-3xl font-bold font-mono ${monthlyIncomeExpense.current.balance >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {formatCurrency(monthlyIncomeExpense.current.balance)}
            </div>
            <div className="flex items-center text-sm text-muted-foreground mt-2.5 gap-1.5">
              {renderMonthDiff(
                monthlyIncomeExpense.current.balance -
                  monthlyIncomeExpense.previous.balance,
                true,
              )}
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
              資産推移（積み上げ・日次）
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
                <TableHead className="whitespace-nowrap">カテゴリー</TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  金額
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  比率
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  {baselineLabel}
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  1週間
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  1カ月
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  1年
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const history = chartData;
                // 比較対象日は JST カレンダー基準で計算する（DB の日付は JST 日付の
                // UTC 真夜中で保存されるため，Date.UTC で同形式の Date を生成する）。
                // ローカル TZ の setDate/setMonth では DST 移行日で時刻が 1 時間ずれ，
                // JST 日付が 1 日ずれる可能性がある
                const nowKey = formatJSTDate(new Date());
                const [ny, nm, nd] = nowKey.split("-").map(Number);
                const oneWeekAgo = new Date(Date.UTC(ny, nm - 1, nd - 7));
                // 月単位の比較日は末日に丸める（3/31 の 1 カ月前は 2/28，2/29 の 1 年前は 2/28）
                const oneMonthAgo = shiftUtcDateOnlyByMonths(ny, nm, nd, -1);
                const oneYearAgo = shiftUtcDateOnlyByMonths(ny, nm, nd, -12);

                // chartData のキーは JST 日付文字列のため，JST で検索する
                // （サーバーの TZ が JST でない環境でも正しくヒットする）
                // 対象日付に履歴エントリが無い場合は null を返す（UI は「—」表示）
                const findValue = (date: Date, key: string): number | null => {
                  const dateStr = formatJSTDate(date);
                  const entry = history.find(h => h.date === dateStr);
                  // entry の型には date: string が含まれるため Number で強制変換する
                  return entry
                    ? Number(entry[key as keyof typeof entry] ?? 0)
                    : null;
                };

                // 比較対象のデータが無い（null）場合は「—」を表示する．
                // 0 と比較すると「+X (0.00%)」という誤解を招く表示になるため．
                // 差が 0 なら増えた扱いの緑にせず，基準が 0 なら率を出さない (DASH-5)
                const renderChange = (current: number, ago: number | null) => {
                  if (ago === null) {
                    return <span className="text-zinc-400">—</span>;
                  }
                  const change = current - ago;
                  const rate = formatChangeRate(current, ago);
                  return (
                    <>
                      <span
                        className={
                          change > 0
                            ? "text-emerald-400"
                            : change < 0
                              ? "text-red-400"
                              : "text-zinc-400"
                        }
                      >
                        {change === 0
                          ? formatCurrency(0)
                          : formatSignedCurrency(change)}
                      </span>
                      {rate !== null && (
                        <span className="whitespace-nowrap text-zinc-400 ml-0.5">
                          ({rate})
                        </span>
                      )}
                    </>
                  );
                };

                return assetOnlySeries.map(s => {
                  const current = kpi.byAssetType[s.key] ?? 0;
                  const pct =
                    totalAssets > 0
                      ? ((current / totalAssets) * 100).toFixed(1)
                      : "0";
                  const yesterday = kpi.yesterdayByType
                    ? (kpi.yesterdayByType[s.key] ?? null)
                    : null;
                  const weekAgo = findValue(oneWeekAgo, s.key);
                  const monthAgo = findValue(oneMonthAgo, s.key);
                  const yearAgo = findValue(oneYearAgo, s.key);

                  return (
                    <TableRow key={s.key}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="whitespace-nowrap text-sm text-zinc-200 truncate">
                            {s.label}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-base font-medium text-zinc-100">
                        {formatCurrency(current)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-sm text-zinc-300">
                        {pct}%
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-sm">
                        {renderChange(current, yesterday)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-sm">
                        {renderChange(current, weekAgo)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-sm">
                        {renderChange(current, monthAgo)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-sm">
                        {renderChange(current, yearAgo)}
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
                    <span className="text-xs text-zinc-400 truncate">
                      {p.subAccount.currentName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:block sm:text-right w-full sm:w-auto">
                    <div className="text-amber-400 font-mono text-base font-bold">
                      {p.points.toLocaleString("ja-JP")} pt
                    </div>
                    <div className="text-xs text-amber-600">
                      {(() => {
                        if (!p.expirationDate) return "—";
                        // JST カレンダー日数の差で計算する（expirationDate は JST 日付の
                        // UTC 真夜中で保存されるため，時刻差の ceil では JST 00:00-09:00
                        // の窓で +1 日ずれる）．getExpiringPoints は expirationDate を
                        // ISO 文字列で返すため，new Date で Date に戻してから整形する
                        const daysLeft = Math.round(
                          (Date.parse(
                            formatJSTDate(new Date(p.expirationDate)),
                          ) -
                            Date.parse(formatJSTDate(new Date()))) /
                            86400000,
                        );
                        return daysLeft <= 0
                          ? "本日中に期限"
                          : `あと ${daysLeft} 日`;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/**
 * ダッシュボードのスケルトンローディングである．
 * KPI，今月の収支 3 枚，推移グラフ，資産構成の並びに合わせ，表示時のずれを抑える．
 */
function DashboardSkeleton() {
  // 包む div で親の space-y-6 が子に届かなくなるので，同じ間隔をここで付け直す．
  // スケルトンは見た目だけなので，読み込み中であることを status で伝える (UI-7)
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">読み込み中</span>
      <Skeleton className="h-[118px] w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-[118px] w-full" />
        <Skeleton className="h-[118px] w-full" />
        <Skeleton className="h-[118px] w-full" />
      </div>
      <Skeleton className="h-[400px] w-full" />
      <Skeleton className="h-[280px] w-full" />
    </div>
  );
}
