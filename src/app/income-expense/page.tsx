import { ArrowLeftRight } from "lucide-react";
import type { Metadata } from "next";
import { IncomeExpenseContent } from "@/components/income-expense/income-expense-content";
import { PageHeader } from "@/components/page-header";
import { formatJSTDate, nowJST } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 収支ページメタデータである．
 */
export const metadata: Metadata = {
  title: "収支 | My Assets",
  description: "月ごとの収入・支出・収支の推移とカテゴリー別内訳を表示する",
};

/**
 * 収支ページコンポーネントである．
 * 月ごとの収入・支出・収支の推移と，カテゴリ別内訳，キャッシュフロー可視化を表示する．
 * 年別推移データはクライアントサイドで年切り替え時にfetchする．
 */
export default async function IncomeExpensePage() {
  // JST 基準で年月を導出する（ローカル TZ の getFullYear/getMonth では
  // JST 日付境界で前後 1 日ずれる）
  const nowKey = formatJSTDate(nowJST());

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="収支" icon={ArrowLeftRight} />

      <IncomeExpenseContent
        initialYear={Number(nowKey.slice(0, 4))}
        initialMonth={Number(nowKey.slice(5, 7))}
      />
    </div>
  );
}
