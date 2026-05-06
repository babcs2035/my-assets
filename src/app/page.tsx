import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";
import {
  getAssetHistory,
  getDashboardKPI,
  getExpiringPoints,
} from "@/actions/dashboard";
import { getLastSyncInfo } from "@/actions/system";
import {
  DashboardAreaChart,
  DashboardDonutChart,
} from "@/components/dashboard/dashboard-charts";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
export default async function DashboardPage() {
  console.log("🏠 Rendering DashboardPage...");

  const [kpi, history, expiringPoints, syncInfo] = await Promise.all([
    getDashboardKPI(),
    getAssetHistory(),
    getExpiringPoints(),
    getLastSyncInfo(),
  ]);

  const chartData = history;

  const donutData = [
    { name: "預金・現金", value: kpi.byAssetType.CASH ?? 0 },
    { name: "投資信託・証券", value: kpi.byAssetType.INVESTMENT ?? 0 },
    { name: "暗号資産", value: kpi.byAssetType.CRYPTO ?? 0 },
    { name: "ポイント", value: kpi.byAssetType.POINT ?? 0 },
  ];

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
      {/* ガイドブック: 最も重要な指標（純資産）を左上に大きく。全体→部分の階層。 */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* 純資産 (最重要指標) */}
        <Card
          className="md:col-span-1 kpi-card"
          style={{ animationDelay: "0ms" }}
        >
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-zinc-400 mb-1">純資産</p>
            <div
              className="text-3xl sm:text-4xl font-bold text-zinc-50 font-mono"
              title={formatCurrency(kpi.netWorth)}
            >
              {formatCurrency(kpi.netWorth)}
            </div>
            {/* 前日比 – ガイドブック: 比較対象を提供する */}
            <div className="flex items-center text-sm text-muted-foreground mt-2.5 gap-1.5">
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

        {/* 総資産 */}
        <Card className="kpi-card" style={{ animationDelay: "60ms" }}>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-zinc-400 mb-1">総資産</p>
            <div
              className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono"
              title={formatCurrency(kpi.totalAssets)}
            >
              {formatCurrency(kpi.totalAssets)}
            </div>
          </CardContent>
        </Card>

        {/* 総負債 */}
        <Card className="kpi-card" style={{ animationDelay: "120ms" }}>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-zinc-400 mb-1">総負債</p>
            <div
              className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono"
              title={formatCurrency(kpi.totalLiabilities)}
            >
              {formatCurrency(kpi.totalLiabilities)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── グラフエリア ────────────────────────── */}
      {/* ガイドブック: 全体の推移 → 構成比 の順で配置 */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* 資産推移（積み上げ面グラフ） */}
        <Card className="col-span-1 lg:col-span-5 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-zinc-200">
              資産推移（積み上げ・月次）
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-0 sm:pl-2">
            <DashboardAreaChart data={chartData} />
          </CardContent>
        </Card>

        {/* 資産構成（ドーナツチャート） */}
        <Card className="col-span-1 lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-zinc-200">
              資産構成比
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardDonutChart data={donutData} />
          </CardContent>
        </Card>
      </div>

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
