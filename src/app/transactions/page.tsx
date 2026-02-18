import { Suspense } from "react";
import { TransactionsContent } from "@/components/transactions/transactions-content";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          入出金明細
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          日々のキャッシュフローを管理し、自動分類ルールを育てます
        </p>
      </div>

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
