"use client";

import dayjs from "dayjs";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [isLoading, setIsLoading] = useState(false);

  const yearOptions = Array.from(
    { length: dayjs().year() - 2023 + 2 },
    (_, i) => 2023 + i,
  );

  useEffect(() => {
    setIsLoading(true);
    (async () => {
      try {
        const [data, annual, trend] = await Promise.all([
          getMonthlyIncomeExpense(year, month),
          getAnnualIncomeExpense(),
          getIncomeExpenseTrend(year),
        ]);
        setMonthlyData(data);
        setAnnualData(annual);
        setTrendData(trend);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [year, month]);

  const changeMonth = (direction: -1 | 1) => {
    let newYear = year;
    let newMonth = month + direction;
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
    setYear(newYear);
    setMonth(newMonth);
  };

  const goThisMonth = () => {
    const now = dayjs();
    setYear(now.year());
    setMonth(now.month() + 1);
  };

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

  // カテゴリ別 pie chart データ
  const incomePieData = useMemo(() => {
    if (!monthlyData) return [];
    return monthlyData.incomeByCategory.map((item, idx) => ({
      name: item.name,
      value: item.amount,
      fill: incomeColors[idx % incomeColors.length],
    }));
  }, [monthlyData]);

  const expensePieData = useMemo(() => {
    if (!monthlyData) return [];
    return monthlyData.expenseByCategory.map((item, idx) => ({
      name: item.name,
      value: item.amount,
      fill: expenseColors[idx % expenseColors.length],
    }));
  }, [monthlyData]);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => changeMonth(-1)}
            >
              <span className="text-lg">‹</span>
            </Button>
            <div className="flex items-center gap-2">
              <Select
                value={String(year)}
                onValueChange={v => setYear(Number(v))}
              >
                <SelectTrigger size="sm" className="h-9 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => (
                    <SelectItem key={y} value={String(y)}>
                      {y}年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(month)}
                onValueChange={v => setMonth(Number(v))}
              >
                <SelectTrigger size="sm" className="h-9 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <SelectItem key={m} value={String(m)}>
                      {m}月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => changeMonth(1)}
            >
              <span className="text-lg">›</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={goThisMonth}
            >
              今月
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardContent className="pt-3 pb-2">
                <p className="text-xs font-medium text-zinc-400 mb-0.5">
                  当月収入
                </p>
                <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono">
                  {formatCurrency(totalMonthlyIncome)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-2">
                <p className="text-xs font-medium text-zinc-400 mb-0.5">
                  当月支出
                </p>
                <div className="text-xl sm:text-2xl font-bold text-red-400 font-mono">
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
                  className={`text-xl sm:text-2xl font-bold font-mono ${monthlyBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {formatCurrency(monthlyBalance)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

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
                            return (
                              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50 max-w-[280px]">
                                <div className="mb-1 text-[10px] text-zinc-400 truncate whitespace-nowrap">
                                  {String(item.name ?? "")}
                                </div>
                                <div className="font-mono text-sm font-bold text-zinc-100">
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
                    {incomePieData
                      .sort((a, b) => b.value - a.value)
                      .map(item => {
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
                            <span className="text-sm text-zinc-300 truncate flex-1">
                              {item.name}
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
                            return (
                              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50 max-w-[280px]">
                                <div className="mb-1 text-[10px] text-zinc-400 truncate whitespace-nowrap">
                                  {String(item.name ?? "")}
                                </div>
                                <div className="font-mono text-sm font-bold text-zinc-100">
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
                    {expensePieData
                      .sort((a, b) => b.value - a.value)
                      .map(item => {
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
                            <span className="text-sm text-zinc-300 truncate flex-1">
                              {item.name}
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
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}月`}
                  />
                  <YAxis
                    stroke="#52525b"
                    fontSize={12}
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
                        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50">
                          <div className="mb-1.5 text-[10px] text-zinc-400">
                            {month ? `${month}月` : ""}
                          </div>
                          <div className="space-y-1">
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
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#52525b"
                    fontSize={12}
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
                        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50">
                          <div className="mb-1.5 text-[10px] text-zinc-400">
                            {year ? `${year}年` : ""}
                          </div>
                          <div className="space-y-1">
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
