"use client";

import { ResponsiveSankey } from "@nivo/sankey";
import { useMemo } from "react";
import { formatCurrency } from "@/lib/utils";

type SankeyData = Awaited<
  ReturnType<typeof import("@/actions/income-expense").getMonthlyIncomeExpense>
>;

interface CashflowSankeyProps {
  data: SankeyData;
}

// income-expense-content.tsx と同じカラーパレット
const incomeColorPalette = [
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#a855f7",
];

const expenseColorPalette = [
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

// 1 ノードあたりの高さ (nodeThickness 20 + nodeSpacing 20)
const SANKEY_NODE_PITCH = 40;
// サンキー図の最小高さ
const SANKEY_MIN_HEIGHT = 300;

/**
 * Sankey ノード ID からカテゴリ名を取得するヘルパーである．
 * income-/expense- プレフィックスを除去し，subOnly が true の場合は
 * メインカテゴリーも除去してサブカテゴリー名のみを返す（チャート上の
 * ラベルは幅制限があるため）．
 */
function categoryName(id: string, subOnly: boolean): string {
  let name = id;
  if (name.startsWith("income-")) {
    name = name.slice(7);
  } else if (name.startsWith("expense-")) {
    name = name.slice(8);
  }
  if (subOnly) {
    const slashIdx = name.indexOf("/");
    if (slashIdx !== -1) {
      name = name.slice(slashIdx + 1);
    }
  }
  return name;
}

/**
 * 集約ノード (ratio/deficit/surplus) の表示ラベルを取得するヘルパーである．
 * ratio ノードの値は max(収入, 支出) であるため，赤字月には「支出合計」と表示する．
 */
function aggregateLabel(id: string, totalIncome: number, totalExpense: number) {
  if (id === "ratio") {
    return totalIncome - totalExpense >= 0 ? "収入合計" : "支出合計";
  }
  if (id === "deficit") return "赤字合計";
  if (id === "surplus") return "黒字合計";
  return null;
}

/**
 * Sankey ダイアグラムによるキャッシュフロー可視化
 *
 * 3 つの明確な縦列（カラム）で構成：
 * - 左カラム（収入・赤字）: 収入カテゴリ（+赤字分）
 * - 中央カラム（収入支出）: 収入合計（+赤字合計）
 * - 右カラム（支出・収支）: 支出カテゴリ（+収支分）
 *
 * フロー: 収入カテゴリ → ratioノード → 支出カテゴリ + 収支(貯蓄)
 * ratioノードの値 = max(収入合計, 支出合計)
 * 色は income-expense-content.tsx と同じパレットをインデックスベースで使用
 */
export function CashflowSankey({ data }: CashflowSankeyProps) {
  const sankeyData = useMemo(() => {
    const { totalIncome, totalExpense, incomeByCategory, expenseByCategory } =
      data;

    if (incomeByCategory.length === 0 || expenseByCategory.length === 0) {
      return null;
    }

    const balance = totalIncome - totalExpense;
    const hasDeficit = balance < 0;
    const deficitAmount = hasDeficit ? Math.abs(balance) : 0;
    const surplusAmount = hasDeficit ? 0 : balance;

    // 3 つの明確な縦列（カラム）を確保：
    // カラム0: 収入カテゴリ（+赤字分）
    // カラム1: ratioノード（収入合計 + 赤字分）
    // カラム2: 支出カテゴリ（+収支分）
    const nodes: Array<{ id: string; value: number }> = [
      // カラム0: 収入カテゴリ
      ...incomeByCategory.map(i => ({
        id: `income-${i.name}`,
        value: i.amount,
      })),
      // カラム0: 赤字分（赤字の場合のみ）
      ...(hasDeficit
        ? [
            {
              id: "deficit",
              value: deficitAmount,
            },
          ]
        : []),
      // カラム1: ratioノード（収入合計 + 赤字分 = max(収入,支出)）
      {
        id: "ratio",
        value: Math.max(totalIncome, totalExpense),
      },
      // カラム2: 支出カテゴリ
      ...expenseByCategory.map(e => ({
        id: `expense-${e.name}`,
        value: e.amount,
      })),
      // カラム2: 収支分（黒字の場合のみ）
      ...(surplusAmount > 0
        ? [
            {
              id: "surplus",
              value: surplusAmount,
            },
          ]
        : []),
    ];

    // フロー構造:
    // 収入カテゴリ → ratioノード
    // 赤字分 → ratioノード（赤字の場合）
    // ratioノード → 支出カテゴリ
    // ratioノード → 収支分（黒字の場合）
    const links: Array<{ source: string; target: string; value: number }> = [];

    // 収入カテゴリ → ratioノード
    incomeByCategory.forEach(income => {
      links.push({
        source: `income-${income.name}`,
        target: "ratio",
        value: income.amount,
      });
    });

    // 赤字分 → ratioノード（赤字の場合）
    if (hasDeficit) {
      links.push({
        source: "deficit",
        target: "ratio",
        value: deficitAmount,
      });
    }

    // ratioノード → 支出カテゴリ
    expenseByCategory.forEach(expense => {
      links.push({
        source: "ratio",
        target: `expense-${expense.name}`,
        value: expense.amount,
      });
    });

    // ratioノード → 収支分（黒字の場合）
    if (surplusAmount > 0) {
      links.push({
        source: "ratio",
        target: "surplus",
        value: surplusAmount,
      });
    }

    return { nodes, links };
  }, [data]);

  if (!sankeyData) return null;

  const { nodes, links } = sankeyData;

  // 固定高さだとノード数が多いカラムで overflow するため，
  // 最もノードが多いカラムに基づいて高さを動的に計算する
  const incomeColumnCount = nodes.filter(
    n => n.id.startsWith("income-") || n.id === "deficit",
  ).length;
  const expenseColumnCount = nodes.filter(
    n => n.id.startsWith("expense-") || n.id === "surplus",
  ).length;
  const chartHeight = Math.max(
    SANKEY_MIN_HEIGHT,
    Math.max(incomeColumnCount, expenseColumnCount) * SANKEY_NODE_PITCH + 40,
  );

  return (
    // 左右 120px のラベルマージンは固定のため，モバイル（375px）では描画域が
    // 不足する。最小幅を確保した内側コンテナを横スクロール可能にして対処する
    <div className="w-full overflow-x-auto">
      <div
        className="w-full min-w-[560px]"
        style={{ height: `${chartHeight}px` }}
      >
        <ResponsiveSankey
          data={{ nodes, links }}
          margin={{ top: 10, right: 120, bottom: 10, left: 120 }}
          align="justify"
          colors={node => {
            // 赤字/収支ノード
            if (node.id === "deficit") return "#ef4444";
            if (node.id === "surplus") return "#10b981";
            // ratioノード
            if (node.id === "ratio") {
              const balance = data.totalIncome - data.totalExpense;
              return balance >= 0 ? "#3b82f6" : "#f97316";
            }
            // 収入カテゴリ（インデックスは income ノードのみで計算）
            if (node.id.startsWith("income-")) {
              const incomeNodes = nodes.filter(n => n.id.startsWith("income-"));
              const idx = incomeNodes.findIndex(n => n.id === node.id);
              return incomeColorPalette[idx % incomeColorPalette.length];
            }
            // 支出カテゴリ（インデックスは expense ノードのみで計算）
            if (node.id.startsWith("expense-")) {
              const expenseNodes = nodes.filter(n =>
                n.id.startsWith("expense-"),
              );
              const idx = expenseNodes.findIndex(n => n.id === node.id);
              return expenseColorPalette[idx % expenseColorPalette.length];
            }
            return "#6b7280";
          }}
          nodeOpacity={1}
          nodeHoverOpacity={1}
          nodeThickness={20}
          nodeSpacing={20}
          nodeBorderWidth={0}
          nodeBorderRadius={3}
          linkOpacity={0.65}
          linkHoverOpacity={0.9}
          linkContract={3}
          enableLinkGradient={true}
          labelPosition="outside"
          labelOrientation="horizontal"
          labelPadding={12}
          // ダークテーマ: 白文字でコントラスト確保
          labelTextColor="#fff"
          label={node => {
            const aggregate = aggregateLabel(
              node.id,
              data.totalIncome,
              data.totalExpense,
            );
            if (aggregate) return aggregate;

            // チャート上のラベルはサブカテゴリーのみ表示（幅制限のため）
            const displayId = categoryName(node.id, true);

            const value = node.value || 0;
            // 支出ノードは支出合計，収入ノードは収入合計を基準にする
            // （すべてを収入合計で割ると赤字月で「120%」のような表示になる）
            const base = node.id.startsWith("expense-")
              ? data.totalExpense
              : data.totalIncome;
            const pct = base === 0 ? "0" : ((value / base) * 100).toFixed(0);

            return `${displayId} ${pct}%`;
          }}
          nodeTooltip={({ node }) => {
            // ツールチップには幅の余裕があるため，main/sub 全体を表示する
            let displayName = categoryName(node.id, false);

            // 集約ノードの displayName を日本語化
            const aggregate = aggregateLabel(
              node.id,
              data.totalIncome,
              data.totalExpense,
            );
            if (aggregate) displayName = aggregate;

            // カラー取得
            let dotColor = "#6b7280";
            if (node.id === "deficit") dotColor = "#ef4444";
            else if (node.id === "surplus") dotColor = "#10b981";
            else if (node.id === "ratio") {
              const balance = data.totalIncome - data.totalExpense;
              dotColor = balance >= 0 ? "#3b82f6" : "#f97316";
            } else if (node.id.startsWith("income-")) {
              const incomeNodes = nodes.filter(n => n.id.startsWith("income-"));
              const idx = incomeNodes.findIndex(n => n.id === node.id);
              dotColor = incomeColorPalette[idx % incomeColorPalette.length];
            } else if (node.id.startsWith("expense-")) {
              const expenseNodes = nodes.filter(n =>
                n.id.startsWith("expense-"),
              );
              const idx = expenseNodes.findIndex(n => n.id === node.id);
              dotColor = expenseColorPalette[idx % expenseColorPalette.length];
            }

            return (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50 max-w-[280px]">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-zinc-300 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span className="text-sm truncate whitespace-nowrap flex-1">
                      {displayName}
                    </span>
                  </span>
                  <span className="font-mono font-bold text-zinc-100 shrink-0">
                    {formatCurrency(node.value || 0)}
                  </span>
                </div>
              </div>
            );
          }}
          linkTooltip={({ link }) => {
            let srcId = categoryName(link.source.id, false);
            let tgtId = categoryName(link.target.id, false);

            // 集約ノードの日本語化
            const srcAggregate = aggregateLabel(
              link.source.id,
              data.totalIncome,
              data.totalExpense,
            );
            if (srcAggregate) srcId = srcAggregate;
            const tgtAggregate = aggregateLabel(
              link.target.id,
              data.totalIncome,
              data.totalExpense,
            );
            if (tgtAggregate) tgtId = tgtAggregate;

            return (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-sm relative z-50 max-w-[280px]">
                <div className="mb-1.5 text-sm text-zinc-400 truncate whitespace-nowrap">
                  {srcId} → {tgtId}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-zinc-300 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: "#6b7280" }}
                      />
                      <span className="truncate whitespace-nowrap flex-1">
                        流量
                      </span>
                    </span>
                    <span className="font-mono font-bold text-zinc-100 shrink-0">
                      {formatCurrency(link.value)}
                    </span>
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
