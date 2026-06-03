import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TransactionsContent } from "@/components/transactions/transactions-content";
import { Skeleton } from "@/components/ui/skeleton";

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
export default function TransactionsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="入出金明細"
        description="日々のキャッシュフローを管理し、自動分類ルールを育てます"
      />

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        }
      >
        <TransactionsContent />
      </Suspense>
    </div>
  );
}
