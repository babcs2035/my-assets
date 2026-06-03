import type { Metadata } from "next";
import { getIncomeExpenseTrend } from "@/actions/income-expense";
import { IncomeExpenseContent } from "@/components/income-expense/income-expense-content";
import { PageHeader } from "@/components/page-header";
import { nowJST } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 収支ページメタデータである．
 */
export const metadata: Metadata = {
  title: "収支 | My Assets",
  description: "月ごとの収入・支出・収支の推移とカテゴリ別内訳を表示する",
};

/**
 * 収支ページコンポーネントである．
 * 月ごとの収入・支出・収支の推移と，カテゴリ別内訳，キャッシュフロー可視化を表示する．
 */
export default async function IncomeExpensePage() {
  const now = nowJST();
  const trend = await getIncomeExpenseTrend(now.getFullYear());

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="収支"
        description="月ごとの収入・支出・収支の推移とカテゴリ別内訳"
      />

      <IncomeExpenseContent
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth() + 1}
        trendData={trend}
      />
    </div>
  );
}
