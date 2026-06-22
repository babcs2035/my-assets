import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsPageContent } from "@/components/accounts/accounts-page-content";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

/**
 * 口座管理ページメタデータである．
 */
export const metadata: Metadata = {
  title: "口座管理 | My Assets",
  description: "金融機関と口座の一覧を管理するページ",
};

/**
 * 口座管理ページコンポーネントである．
 * ガイドブック: タイトルにページの内容を正確に表記する．
 */
export default function AccountsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="口座管理" icon={Building2} />

      <Suspense fallback={<AccountsPageSkeleton />}>
        <AccountsPageContent />
      </Suspense>
    </div>
  );
}

/**
 * 口座管理ページのスケルトンローディングである．
 */
function AccountsPageSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-48 w-full" />
      ))}
    </div>
  );
}
