import type { Metadata } from "next";
import { Suspense } from "react";
import { getAccountDetail } from "@/actions/accounts";
import { AccountDetailPageContent } from "@/components/accounts/account-detail-page-content";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

/**
 * 口座詳細ページメタデータを生成する．
 * 口座名が動的にタイトルに反映される．
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const account = await getAccountDetail(id);
  if (!account) {
    return { title: "口座詳細 | My Assets" };
  }
  return {
    title: `${account.label} | My Assets`,
    description: `${account.provider.name} - ${account.label} の詳細`,
  };
}

/**
 * 口座詳細ページコンポーネントである．
 * ガイドブック: タイトルにページの内容を正確に表記する．
 */
export default function AccountDetailPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <Suspense fallback={<AccountDetailPageSkeleton />}>
        <AccountDetailPageContent />
      </Suspense>
    </div>
  );
}

/**
 * 口座詳細ページのスケルトンローディングである．
 */
function AccountDetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-5 w-64" />
        </div>
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
