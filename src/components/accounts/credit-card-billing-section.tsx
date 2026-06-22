"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

/**
 * クレジットカード請求履歴のデータ型である．
 */
type BillingRecord = {
  id: string;
  billingDate: Date;
  amount: number;
  content: string | null;
  subAccount: {
    id: string;
    currentName: string;
  };
};

/**
 * クレジットカード請求履歴セクションコンポーネントである．
 * 年月ごとの請求額をカード別の積み上げ棒グラフで可視化する．
 */
export function CreditCardBillingSection({
  billings,
}: {
  billings: BillingRecord[];
}) {
  if (billings.length === 0) return null;

  // 年月ごとにカード別を集計
  const monthlyMap = new Map<string, Record<string, number>>();
  const cardNames: string[] = [];

  for (const b of billings) {
    const date = new Date(b.billingDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const name = b.subAccount.currentName;

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {});
    }
    const monthData = monthlyMap.get(monthKey) ?? {};
    monthData[name] = (monthData[name] ?? 0) + b.amount;

    if (!cardNames.includes(name)) {
      cardNames.push(name);
    }
  }

  // 年月でソート
  const sortedMonths = Array.from(monthlyMap.keys()).sort();

  // 値を正に変換してチャート用データを作成
  const chartData = sortedMonths.map(month => {
    const monthData = monthlyMap.get(month) ?? {};
    const entry: Record<string, string | number> = { month };
    for (const card of cardNames) {
      // 請求額は負の値なので、グラフ上で正として表示するために符号を反転
      entry[card] = Math.abs(monthData[card] ?? 0);
    }
    return entry as Record<string, string | number>;
  });

  if (chartData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium text-zinc-200">
          クレジットカード請求履歴
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#a1a1aa", fontSize: 13 }}
                tickFormatter={value => {
                  const [y, m] = value.split("-");
                  return `${y}/${m}`;
                }}
              />
              <YAxis
                tick={{ fill: "#a1a1aa", fontSize: 13 }}
                tickFormatter={value => formatCurrency(value)}
              />
              <Tooltip
                formatter={value =>
                  formatCurrency(typeof value === "number" ? value : 0)
                }
                labelFormatter={label => {
                  const [y, m] = (label as string).split("-");
                  return `${y}/${m} お支払い分`;
                }}
                contentStyle={{
                  backgroundColor: "rgb(39 39 42 / 0.95)",
                  border: "1px solid rgb(63 63 70)",
                  borderRadius: "8px",
                  color: "#e4e4e7",
                  fontSize: "13px",
                }}
              />
              <Legend
                formatter={value => value}
                wrapperStyle={{
                  fontSize: "13px",
                  color: "#a1a1aa",
                }}
              />
              {cardNames.map((card, index) => (
                <Bar
                  key={card}
                  dataKey={card}
                  stackId="amount"
                  fill={index % 2 === 0 ? "#ef4444" : "#f97316"}
                  radius={[
                    index === cardNames.length - 1 ? 4 : 0,
                    index === cardNames.length - 1 ? 4 : 0,
                    0,
                    0,
                  ]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
