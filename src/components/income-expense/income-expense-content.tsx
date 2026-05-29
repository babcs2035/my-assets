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
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAnnualIncomeExpense,
  getMonthlyIncomeExpense,
} from "@/actions/income-expense";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

type TrendData = Awaited<ReturnType<typeof getMonthlyIncomeExpense>>;

interface IncomeExpenseContentProps {
  initialYear: number;
  initialMonth: number;
  trendData: Array<{
    period: string;
    income: number;
    expense: number;
    balance: number;
    cumulativeIncome: number;
    cumulativeExpense: number;
    cumulativeBalance: number;
    liabilityChange?: number;
  }>;
}

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
  trendData,
}: IncomeExpenseContentProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [monthlyData, setMonthlyData] = useState<TrendData | null>(null);
  const [annualData, setAnnualData] = useState<
    Array<{ year: number; income: number; expense: number; balance: number }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const yearOptions = Array.from(
    { length: dayjs().year() - 2023 + 2 },
    (_, i) => 2023 + i,
  );

  useEffect(() => {
    setIsLoading(true);
    (async () => {
      try {
        const [data, annual] = await Promise.all([
          getMonthlyIncomeExpense(year, month),
          getAnnualIncomeExpense(),
        ]);
        setMonthlyData(data);
        setAnnualData(annual);
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
        expense: d.expense,
        balance: d.balance,
        liabilityChange: d.liabilityChange ?? 0,
      }));
  }, [trendData, year]);

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
      expense: d.expense,
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
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="h-9 w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-200"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="h-9 w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-200"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
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

      {/* キャッシュフロー可視化（リング型） */}
      {monthlyData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium text-zinc-200">
              キャッシュフロー
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-6 py-4">
              {(() => {
                const maxAmount = Math.max(
                  monthlyData.totalIncome,
                  monthlyData.totalExpense,
                  Math.abs(monthlyData.balance),
                  1,
                );
                const rings = [
                  {
                    name: "収入",
                    amount: monthlyData.totalIncome,
                    color: "#10b981",
                    radius: Math.max(
                      20,
                      (monthlyData.totalIncome / maxAmount) * 50,
                    ),
                  },
                  {
                    name: "支出",
                    amount: monthlyData.totalExpense,
                    color: "#ef4444",
                    radius: Math.max(
                      20,
                      (monthlyData.totalExpense / maxAmount) * 50,
                    ),
                  },
                  {
                    name: "純流動",
                    amount: monthlyData.balance,
                    color: monthlyData.balance >= 0 ? "#3b82f6" : "#f97316",
                    radius: Math.max(
                      20,
                      (Math.abs(monthlyData.balance) / maxAmount) * 50,
                    ),
                  },
                ];
                return rings.map(ring => (
                  <div
                    key={ring.name}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="relative w-28 h-28 shrink-0">
                      <ChartContainer
                        config={{
                          [ring.name]: {
                            label: ring.name,
                            color: ring.color,
                          },
                        }}
                        className="w-full h-full"
                      >
                        <PieChart>
                          <Pie
                            data={[
                              {
                                name: ring.name,
                                value: Math.max(ring.radius, 1),
                              },
                              { name: "empty", value: 999 },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={ring.radius * 0.55}
                            outerRadius={ring.radius}
                            startAngle={90}
                            endAngle={-270}
                            strokeWidth={2}
                            stroke="transparent"
                          >
                            <Cell key="ring" fill={ring.color} />
                            <Cell key="empty" fill="transparent" />
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-zinc-400">
                          {ring.name}
                        </span>
                        <span
                          className={`text-xs font-bold font-mono ${
                            ring.name === "収入"
                              ? "text-emerald-400"
                              : ring.name === "支出"
                                ? "text-red-400"
                                : ring.amount >= 0
                                  ? "text-blue-400"
                                  : "text-orange-400"
                          }`}
                        >
                          {formatCurrency(ring.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
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
                <div className="flex items-center gap-6">
                  <div className="w-48 h-48 shrink-0">
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
                              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50">
                                <div className="mb-1 text-[10px] text-zinc-400">
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
                  <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[200px]">
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
                <div className="flex items-center gap-6">
                  <div className="w-48 h-48 shrink-0">
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
                              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-sm relative z-50">
                                <div className="mb-1 text-[10px] text-zinc-400">
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
                  <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[200px]">
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
                  liability: {
                    label: "負債増減",
                    color: "#a855f7",
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
                    tickFormatter={value =>
                      value >= 100000000
                        ? `${(value / 100000000).toFixed(1)}億`
                        : value >= 10000
                          ? `${Math.round(value / 10000)}万`
                          : `${value}`
                    }
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
                        liabilityChange: "負債増減",
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
                        liability: "負債増減",
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
                    stackId="positive"
                  />
                  <Bar
                    dataKey="liabilityChange"
                    fill="var(--color-liability)"
                    radius={[0, 0, 4, 4]}
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
                <LineChart
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
                    tickFormatter={value =>
                      value >= 100000000
                        ? `${(value / 100000000).toFixed(1)}億`
                        : value >= 10000
                          ? `${Math.round(value / 10000)}万`
                          : `${value}`
                    }
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
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="var(--color-income)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expense"
                    stroke="var(--color-expense)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--color-balance)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
