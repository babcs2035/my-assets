import { ArrowDownUp } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import {
  TransactionsContent,
  type TransactionsInitialState,
} from "@/components/transactions/transactions-content";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BACKFILL_START_DATE,
  formatJSTDate,
  nowJST,
  parsePositiveIntegerParam,
  parseYearMonthParam,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 入出金明細ページメタデータである．
 */
export const metadata: Metadata = {
  title: "入出金明細 | My Assets",
  description: "日々のキャッシュフローを管理し、自動分類ルールを育てる",
};

/**
 * 入出金明細ページコンポーネントである．
 * ガイドブック: タイトルにページの内容を正確に表記する．
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // URL に残した表示状態を開き直す (TX-7)．読めない値は既定 (今月・絞り込みなし・1 ページ目) に戻す
  const params = await searchParams;
  const nowKey = formatJSTDate(nowJST());
  const yearMonth = parseYearMonthParam(params.month, BACKFILL_START_DATE) ?? {
    year: Number(nowKey.slice(0, 4)),
    month: Number(nowKey.slice(5, 7)),
  };
  // Date.UTC の日に 0 を渡すと前月の末日になるので，その月の日数が分かる
  const daysInMonth = new Date(
    Date.UTC(yearMonth.year, yearMonth.month, 0),
  ).getUTCDate();
  const day = parsePositiveIntegerParam(params.day);
  const initialState: TransactionsInitialState = {
    ...yearMonth,
    day: day !== null && day <= daysInMonth ? day : null,
    page: parsePositiveIntegerParam(params.page) ?? 1,
    mainAccountId:
      typeof params.mainAccount === "string" && params.mainAccount !== ""
        ? params.mainAccount
        : "all",
    subAccountId:
      typeof params.subAccount === "string" && params.subAccount !== ""
        ? params.subAccount
        : "all",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="入出金明細" icon={ArrowDownUp} />

      <Suspense
        fallback={
          <div role="status" className="space-y-4">
            <span className="sr-only">読み込み中</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        }
      >
        <TransactionsContent initialState={initialState} />
      </Suspense>
    </div>
  );
}
