import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getAssetBreakdown } from "@/actions/assets";
import { AssetsContent } from "@/components/assets/assets-content";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

/**
 * 資産ページメタデータである．
 */
export const metadata: Metadata = {
  title: "資産 | My Assets",
  description: "資産・負債の内訳とバランスシートを表示するページ",
};

/**
 * 資産ページコンポーネントである．
 * 資産・負債の内訳，評価損益，バランスシートを表示する．
 */
export default function AssetsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="資産" icon={TrendingUp} />

      {/* layout ではなくページ内で Suspense に包む（layout で包むと口座詳細の notFound() が HTTP 200 になる） */}
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        }
      >
        <AssetsBreakdownSection />
      </Suspense>
    </div>
  );
}

/**
 * 資産の内訳を取得して AssetsContent に渡す．
 */
async function AssetsBreakdownSection() {
  const breakdown = await getAssetBreakdown();
  return <AssetsContent breakdown={breakdown} />;
}
