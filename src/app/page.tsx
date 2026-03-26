import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Minus,
  Wallet,
} from "lucide-react";
import {
  getAssetHistory,
  getDashboardKPI,
  getExpiringPoints,
} from "@/actions/dashboard";
import {
  DashboardAreaChart,
  DashboardDonutChart,
} from "@/components/dashboard/dashboard-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

/**
 * 常に最新のデータを表示させるため，動的レンダリングを強制する設定である．
 */
export const dynamic = "force-dynamic";

/**
 * ダッシュボードのメインページコンポーネントである．
 * 総資産，推移，構成比，有効期限の近いポイントなどの情報を一画面で表示する．
 */
export default async function DashboardPage() {
  console.log("🏠 Rendering DashboardPage...");

  // KPI，履歴，ポイント情報を並行して取得する．
  const [kpi, history, expiringPoints] = await Promise.all([
    getDashboardKPI(),
    getAssetHistory(),
    getExpiringPoints(),
  ]);

  /**
   * KPI カードの表示設定を定義するオブジェクト配列である．
   */
  const kpiCards = [
    {
      title: "総資産",
      metric: kpi.totalAssets,
      icon: Wallet,
      color: "text-blue-500",
    },
    {
      title: "総負債",
      metric: kpi.totalLiabilities,
      icon: CreditCard,
      color: "text-red-500",
    },
    {
      title: "純資産",
      metric: kpi.netWorth,
      icon: Activity,
      color: "text-emerald-500",
      delta: kpi.dailyChange,
    },
  ];

  /**
   * 推移グラフ表示用のデータ（getAssetHistory の戻り値をそのまま使用する）．
   */
  const chartData = history;

  /**
   * 資産構成のドーナツチャート用データを構成する．
   */
  const donutData = [
    { name: "預金・現金", value: kpi.byAssetType.CASH ?? 0 },
    { name: "投資信託・証券", value: kpi.byAssetType.INVESTMENT ?? 0 },
    { name: "暗号資産", value: kpi.byAssetType.CRYPTO ?? 0 },
    { name: "ポイント", value: kpi.byAssetType.POINT ?? 0 },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ページヘッダー部分 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          ダッシュボード
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          資産全体の概況と推移を確認できます．
        </p>
      </div>

      {/* KPI カードエリア */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-3">
        {kpiCards.map(item => (
          <Card key={item.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-200">
                {item.title}
              </CardTitle>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold text-zinc-100 truncate"
                title={formatCurrency(item.metric)}
              >
                {formatCurrency(item.metric)}
              </div>
              {item.delta !== undefined && (
                <div className="flex items-center text-xs text-muted-foreground mt-1 truncate">
                  {item.delta > 0 ? (
                    <ArrowUpRight className="mr-1 h-3 w-3 text-emerald-500 shrink-0" />
                  ) : item.delta < 0 ? (
                    <ArrowDownRight className="mr-1 h-3 w-3 text-red-500 shrink-0" />
                  ) : (
                    <Minus className="mr-1 h-3 w-3 text-zinc-500 shrink-0" />
                  )}
                  <span
                    className={
                      item.delta > 0
                        ? "text-emerald-500"
                        : item.delta < 0
                          ? "text-red-500"
                          : "text-zinc-500"
                    }
                  >
                    {item.delta > 0 && "+"}
                    {item.delta.toLocaleString()} 円
                  </span>
                  <span className="ml-1 text-zinc-600 shrink-0">
                    （前日比）
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* グラフエリア */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-7">
        {/* 資産推移グラフ */}
        <Card className="col-span-1 lg:col-span-5 overflow-hidden">
          <CardHeader>
            <CardTitle>資産推移</CardTitle>
          </CardHeader>
          <CardContent className="pl-0 sm:pl-2">
            <DashboardAreaChart data={chartData} />
          </CardContent>
        </Card>

        {/* 資産構成ドーナツチャート */}
        <Card className="col-span-1 lg:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>資産構成</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <DashboardDonutChart data={donutData} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 期限間近のポイント通知エリア */}
      {expiringPoints.length > 0 && (
        <Card className="border-amber-900/50 bg-amber-950/10 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              期限切れ間近のポイント
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {expiringPoints.map(p => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-amber-900/30 pb-3 last:border-0 last:pb-0 gap-2"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-zinc-200 truncate">
                      {p.subAccount.mainAccount.label}
                    </span>
                    <span className="text-xs text-zinc-400 truncate">
                      {p.subAccount.currentName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:block sm:text-right w-full sm:w-auto">
                    <div className="text-amber-400 font-mono text-lg sm:text-base">
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
