"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Pie, PieChart, XAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

/**
 * チャートのカラー配色とラベルを定義する設定オブジェクトである．
 */
const chartConfig = {
  cash: {
    label: "預金・現金",
    color: "hsl(var(--chart-1))",
  },
  investment: {
    label: "投資信託・証券",
    color: "hsl(var(--chart-2))",
  },
  crypto: {
    label: "暗号資産",
    color: "hsl(var(--chart-3))",
  },
  point: {
    label: "ポイント",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;

/**
 * 日本語の資産タイプ名を ChartConfig のキーに変換するためのマッピングである．
 */
const keyMap: Record<string, keyof typeof chartConfig> = {
  "預金・現金": "cash",
  "投資信託・証券": "investment",
  暗号資産: "crypto",
  ポイント: "point",
};

/**
 * チャート上の数値を日本円形式にフォーマットする関数である．
 */
const valueFormatter = (number: number) =>
  `¥ ${Intl.NumberFormat("ja-JP").format(number)}`;

interface DashboardAreaChartProps {
  data: Record<string, unknown>[];
}

/**
 * ダッシュボードに表示する資産推移 (積み上げエリアチャート) コンポーネントである．
 */
export function DashboardAreaChart({ data }: DashboardAreaChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // クライアントサイドでのマウント後にチャートを描画するためのフラグを設定する．
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-[200px] w-full mt-4 h-72 min-w-0" />;
  }

  // 表示すべきデータが存在しない場合のフォールバック表示である．
  if (data.length === 0) {
    return (
      <div className="flex h-72 w-full items-center justify-center text-sm text-zinc-500 border border-dashed rounded-md mt-4">
        表示するデータがありません．
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="min-h-[200px] w-full mt-4 h-72 min-w-0"
      style={{ width: "100%", height: "288px" }}
    >
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{
          left: 12,
          right: 12,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={value => {
            const date = new Date(value);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          }}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value: number | string) =>
                valueFormatter(Number(value))
              }
            />
          }
        />
        <Area
          dataKey="預金・現金"
          type="monotone"
          fill="var(--color-cash)"
          fillOpacity={0.4}
          stroke="var(--color-cash)"
          stackId="a"
        />
        <Area
          dataKey="投資信託・証券"
          type="monotone"
          fill="var(--color-investment)"
          fillOpacity={0.4}
          stroke="var(--color-investment)"
          stackId="a"
        />
        <Area
          dataKey="暗号資産"
          type="monotone"
          fill="var(--color-crypto)"
          fillOpacity={0.4}
          stroke="var(--color-crypto)"
          stackId="a"
        />
        <Area
          dataKey="ポイント"
          type="monotone"
          fill="var(--color-point)"
          fillOpacity={0.4}
          stroke="var(--color-point)"
          stackId="a"
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}

interface DashboardDonutChartProps {
  data: Record<string, unknown>[];
}

/**
 * 資産構成比を表示するドーナツチャートコンポーネントである．
 */
export function DashboardDonutChart({ data }: DashboardDonutChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pieData = (data as { name: string; value: number }[]).map(item => {
    const key = keyMap[item.name] || "cash";
    return {
      ...item,
      fill: `var(--color-${key})`,
    };
  });

  const hasData = pieData.some(d => d.value > 0);

  if (!mounted) {
    return <div className="mx-auto aspect-square max-h-[250px] pb-0 min-w-0" />;
  }

  // 有効なデータ (値が 0 より大きい要素) がない場合の表示である．
  if (!hasData) {
    return (
      <div className="flex h-[250px] w-full items-center justify-center text-sm text-zinc-500 border border-dashed rounded-md mx-auto">
        表示するデータがありません．
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-[250px] pb-0 min-w-0 [&_.recharts-pie-label-text]:fill-foreground"
      style={{ width: "100%" }}
    >
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value: number | string) =>
                valueFormatter(Number(value))
              }
            />
          }
        />
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          strokeWidth={5}
        />
        <ChartLegend
          content={<ChartLegendContent />}
          className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
        />
      </PieChart>
    </ChartContainer>
  );
}
