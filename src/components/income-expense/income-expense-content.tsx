"use client";

import dayjs from "dayjs";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAnnualIncomeExpense,
  getIncomeExpenseTrend,
  getMonthlyIncomeExpense,
} from "@/actions/income-expense";
import { CashflowSankey } from "@/components/income-expense/cashflow-sankey";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { MonthNavigator } from "@/components/ui/month-navigator";
import { formatCurrency } from "@/lib/utils";

type TrendData = Awaited<ReturnType<typeof getMonthlyIncomeExpense>>;

interface IncomeExpenseContentProps {
  initialYear: number;
  initialMonth: number;
}

type TrendRow = {
  period: string;
  income: number;
  expense: number;
  balance: number;
  cumulativeIncome: number;
  cumulativeExpense: number;
  cumulativeBalance: number;
};

const expenseColors = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
];

const incomeColors = [
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#a855f7",
];

export function IncomeExpenseContent({
  initialYear,
  initialMonth,
}: IncomeExpenseContentProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [monthlyData, setMonthlyData] = useState<TrendData | null>(null);
  const [annualData, setAnnualData] = useState<
    Array<{ year: number; income: number; expense: number; balance: number }>
  >([]);
  const [trendData, setTrendData] = useState<TrendRow[]>([]);
  // 初期値は true：初回フェッチ完了前に KPI が「¥0」でちらつかないようにする
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 月を素早く切り替えた際に古い応答が新しい応答を上書きしないよう，
  // リクエストの順序を管理する
  const requestIdRef = useRef(0);

  // 年別データは月に依存しないため，マウント時と再試行時のみ取得する
  const fetchAnnual = useCallback(async () => {
    try {
      const annual = await getAnnualIncomeExpense();
      setAnnualData(annual);
    } catch {
      // 月次フェッチのエラー表示に集約するためここでは無視する
    }
  }, []);

  const fetchMonthly = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const [data, trend] = await Promise.all([
        getMonthlyIncomeExpense(year, month),
        getIncomeExpenseTrend(year),
      ]);
      if (requestId !== requestIdRef.current) return;
      setMonthlyData(data);
      setTrendData(trend);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setMonthlyData(null);
      setError("収支データの取得に失敗しました．");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void fetchMonthly();
  }, [fetchMonthly]);

  useEffect(() => {
    void fetchAnnual();
  }, [fetchAnnual]);

  // 月別推移データ（表示用）
  const monthlyTrend = useMemo(() => {
    return trendData
      .filter(d => d.period.startsWith(String(year)))
      .map(d => ({
        month: d.period.split("-")[1],
        income: d.income,
        expense: -d.expense,
        balance: d.balance,
      }));
  }, [year, trendData]);

  const totalMonthlyIncome = monthlyData?.totalIncome ?? 0;
  const totalMonthlyExpense = monthlyData?.totalExpense ?? 0;
  const monthlyBalance = monthlyData?.balance ?? 0;

  // カテゴリ名を "メイン/サブ" 形式に分解するヘルパー
  const parseCategoryName = useCallback((name: string) => {
    const slashIdx = name.indexOf("/");
    if (slashIdx < 0) return { mainCategory: name, subCategory: name };
    return {
      mainCategory: name.slice(0, slashIdx),
      subCategory: name.slice(slashIdx + 1),
    };
  }, []);

  // カテゴリ別 pie chart データ（階層表示用）
  const incomePieData = useMemo(() => {
    if (!monthlyData) return [];
    return monthlyData.incomeByCategory.map((item, idx) => {
      const { mainCategory, subCategory } = parseCategoryName(item.name);
      return {
        name: item.name,
        mainCategory,
        subCategory,
        value: item.amount,
        fill: incomeColors[idx % incomeColors.length],
      };
    });
  }, [monthlyData, parseCategoryName]);

  const expensePieData = useMemo(() => {
    if (!monthlyData) return [];
    return monthlyData.expenseByCategory.map((item, idx) => {
      const { mainCategory, subCategory } = parseCategoryName(item.name);
      return {
        name: item.name,
        mainCategory,
        subCategory,
        value: item.amount,
        fill: expenseColors[idx % expenseColors.length],
      };
    });
  }, [monthlyData, parseCategoryName]);

  const totalIncomeValue = incomePieData.reduce((s, d) => s + d.value, 0);
  const totalExpenseValue = expensePieData.reduce((s, d) => s + d.value, 0);

  // 年間推移データ
  const annualTrendData = useMemo(() => {
    return annualData.map(d => ({
      year: d.year,
      income: d.income,
      expense: -d.expense,
      balance: d.balance,
    }));
  }, [annualData]);

  return (
    <div className="space-y-6">
      {/* 年月セレクターと累計表示 */}
      <div className="space-y-4">
        <MonthNavigator
          year={year}
          month={month}
          onMonthChange={(newYear, newMonth) => {
            setYear(newYear);
            setMonth(newMonth);
          }}
          onThisMonth={() => {
            const now = dayjs();
            setYear(now.year());
            setMonth(now.month() + 1);
          }}
        />

        {error ? (
          <div className="flex flex-col items-center gap-3 py-8 border border-red-900/40 bg-red-950/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void fetchMonthly();
                void fetchAnnual();
              }}
            >
              再試行
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : totalMonthlyIncome === 0 && totalMonthlyExpense === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-md">
            この月には取引データがありません
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardContent className="pt-3 pb-2">
                <p className="text-xs font-medium text-zinc-400 mb-0.5">
                  当月収入
                </p>
                <div className="text-2xl font-bold text-emerald-400 font-mono tracking-tight">
                  {formatCurrency(totalMonthlyIncome)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-2">
                <p className="text-xs font-medium text-zinc-400 mb-0.5">
                  当月支出
                </p>
                <div className="text-2xl font-bold text-red-400 font-mono tracking-tight">
                  {formatCurrency(totalMonthlyExpense)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-2">
                <p className="text-xs font-medium text-zinc-400 mb-0.5">
                  当月収支
                </p>
                <div
                  className={`text-2xl font-bold font-mono tracking-tight ${monthlyBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {formatCurrency(monthlyBalance)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* 読み込み中はチャート領域を減光する
          （月の切り替え中に前月のデータが当月のデータのように見えるのを防ぐため） */}
      <div
        className={
          isLoading && monthlyData
            ? "pointer-events-none opacity-50 transition-opacity"
            : "transition-opacity"
        }
      >
        {/* キャッシュフロー可視化（Sankey ダイアグラム・3 カラム構成） */}
        {monthlyData && monthlyData.expenseByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium text-zinc-200">
                キャッシュフロー
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CashflowSankey data={monthlyData} />
            </CardContent>
          </Card>
        )}

        {/* カテゴリ別内訳（円グラフ） */}
        {(incomePieData.length > 0 || expensePieData.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            {incomePieData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium text-emerald-400">
                    収入内訳
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="flex items-center gap-6"
                    style={{ flexDirection: "column" }}
                  >
                    <div className="w-48 h-48 shrink-0 overflow-hidden">
                      <ChartContainer
                        config={Object.fromEntries(
                          incomePieData.map((d, i) => [
                            `income-${i}`,
                            { label: d.name, color: d.fill },
                          ]),
                        )}
                        className="h-full w-full"
                      >
                        <PieChart>
                          <Pie
                            data={incomePieData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={40}
                            outerRadius={70}
                            strokeWidth={2}
                            stroke="oklch(0.19 0.01 285)"
                          >
                            {incomePieData.map(entry => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Pie>
                          <ChartTooltip
                            wrapperStyle={{ zIndex: 100 }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const item = payload[0];
                              const name = String(item.name ?? "");
                              const { mainCategory, subCategory } =
                                parseCategoryName(name);
                              return (
                                <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50 max-w-[280px]">
                                  <div className="mb-1.5 space-y-0.5">
                                    <span className="text-sm font-bold text-zinc-200">
                                      {mainCategory}
                                    </span>
                                    <span className="text-sm text-zinc-400">
                                      {subCategory}
                                    </span>
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
                    <div className="w-full space-y-1.5">
                      {/* incomeByCategory はサーバー側で金額降順にソート済み */}
                      {incomePieData.map(item => {
                        const pct =
                          totalIncomeValue > 0
                            ? ((item.value / totalIncomeValue) * 100).toFixed(1)
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
                            <span className="text-sm flex-1 truncate">
                              <span className="font-medium text-zinc-200">
                                {item.mainCategory}
                              </span>
                              <span className="text-zinc-500"> / </span>
                              <span className="text-zinc-300">
                                {item.subCategory}
                              </span>
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
                </CardContent>
              </Card>
            )}

            {expensePieData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium text-red-400">
                    支出内訳
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="flex items-center gap-6"
                    style={{ flexDirection: "column" }}
                  >
                    <div className="w-48 h-48 shrink-0 overflow-hidden">
                      <ChartContainer
                        config={Object.fromEntries(
                          expensePieData.map((d, i) => [
                            `expense-${i}`,
                            { label: d.name, color: d.fill },
                          ]),
                        )}
                        className="h-full w-full"
                      >
                        <PieChart>
                          <Pie
                            data={expensePieData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={40}
                            outerRadius={70}
                            strokeWidth={2}
                            stroke="oklch(0.19 0.01 285)"
                          >
                            {expensePieData.map(entry => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Pie>
                          <ChartTooltip
                            wrapperStyle={{ zIndex: 100 }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const item = payload[0];
                              const name = String(item.name ?? "");
                              const { mainCategory, subCategory } =
                                parseCategoryName(name);
                              return (
                                <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50 max-w-[280px]">
                                  <div className="mb-1.5 space-y-0.5">
                                    <span className="text-sm font-bold text-zinc-200">
                                      {mainCategory}
                                    </span>
                                    <span className="text-sm text-zinc-400">
                                      {subCategory}
                                    </span>
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
                    <div className="w-full space-y-1.5">
                      {/* expenseByCategory はサーバー側で金額降順にソート済み */}
                      {expensePieData.map(item => {
                        const pct =
                          totalExpenseValue > 0
                            ? ((item.value / totalExpenseValue) * 100).toFixed(
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
                            <span className="text-sm flex-1 truncate">
                              <span className="font-medium text-zinc-200">
                                {item.mainCategory}
                              </span>
                              <span className="text-zinc-500"> / </span>
                              <span className="text-zinc-300">
                                {item.subCategory}
                              </span>
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
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* 月別収支推移（棒グラフ＋折れ線グラフ） */}
        {monthlyTrend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium text-zinc-200">
                {year}年 月別収支推移
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ChartContainer
                  config={{
                    income: {
                      label: "収入",
                      color: "#10b981",
                    },
                    expense: {
                      label: "支出",
                      color: "#ef4444",
                    },
                    balance: {
                      label: "収支",
                      color: "#3b82f6",
                    },
                  }}
                  className="h-full w-full"
                >
                  <BarChart
                    data={monthlyTrend}
                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#27272a"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="#52525b"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${v}月`}
                    />
                    <YAxis
                      stroke="#52525b"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={value => {
                        const abs = Math.abs(value);
                        const sign = value < 0 ? "-" : "";
                        if (abs >= 100000000)
                          return `${sign}${(abs / 100000000).toFixed(1)}億`;
                        if (abs >= 10000)
                          return `${sign}${Math.round(abs / 10000)}万`;
                        return `${sign}${abs}`;
                      }}
                      width={80}
                    />
                    <ChartTooltip
                      wrapperStyle={{ zIndex: 100 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const month = payload[0]?.payload?.month;
                        const labelMap: Record<string, string> = {
                          income: "収入",
                          expense: "支出",
                          balance: "収支",
                        };
                        return (
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50">
                            <div className="mb-1.5 text-sm text-zinc-400">
                              {month ? `${month}月` : ""}
                            </div>
                            <div className="space-y-1.5">
                              {payload.map(item => (
                                <div
                                  key={String(item.dataKey)}
                                  className="flex items-center justify-between gap-4 text-xs"
                                >
                                  <span className="flex items-center gap-1.5 text-zinc-300">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    {labelMap[String(item.name)] ??
                                      String(item.name)}
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
                    <Legend
                      formatter={value => {
                        const labels: Record<string, string> = {
                          income: "収入",
                          expense: "支出",
                          balance: "収支",
                        };
                        return labels[value] ?? value;
                      }}
                      wrapperStyle={{ fontSize: "12px" }}
                    />
                    <Bar
                      dataKey="income"
                      fill="var(--color-income)"
                      radius={[4, 4, 0, 0]}
                      stackId="positive"
                    />
                    <Bar
                      dataKey="expense"
                      fill="var(--color-expense)"
                      radius={[4, 4, 0, 0]}
                      stackId="negative"
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke="var(--color-balance)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 年間収支推移（折れ線グラフ） */}
      {annualTrendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium text-zinc-200">
              年間収支推移
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ChartContainer
                config={{
                  income: {
                    label: "収入",
                    color: "#10b981",
                  },
                  expense: {
                    label: "支出",
                    color: "#ef4444",
                  },
                  balance: {
                    label: "収支",
                    color: "#3b82f6",
                  },
                }}
                className="h-full w-full"
              >
                <BarChart
                  data={annualTrendData}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#27272a"
                  />
                  <XAxis
                    dataKey="year"
                    stroke="#52525b"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#52525b"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={value => {
                      const abs = Math.abs(value);
                      const sign = value < 0 ? "-" : "";
                      if (abs >= 100000000)
                        return `${sign}${(abs / 100000000).toFixed(1)}億`;
                      if (abs >= 10000)
                        return `${sign}${Math.round(abs / 10000)}万`;
                      return `${sign}${abs}`;
                    }}
                    width={80}
                  />
                  <ChartTooltip
                    wrapperStyle={{ zIndex: 100 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const year = payload[0]?.payload?.year;
                      const labelMap: Record<string, string> = {
                        income: "収入",
                        expense: "支出",
                        balance: "収支",
                      };
                      return (
                        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50">
                          <div className="mb-1.5 text-sm text-zinc-400">
                            {year ? `${year}年` : ""}
                          </div>
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
                                  {labelMap[String(item.name)] ??
                                    String(item.name)}
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
                  <Legend
                    formatter={value => {
                      const labels: Record<string, string> = {
                        income: "収入",
                        expense: "支出",
                        balance: "収支",
                      };
                      return labels[value] ?? value;
                    }}
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                  <Bar
                    dataKey="income"
                    fill="var(--color-income)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="expense"
                    fill="var(--color-expense)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--color-balance)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
