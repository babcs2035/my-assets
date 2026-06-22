import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { getAssetBreakdown } from "@/actions/assets";
import { AssetsContent } from "@/components/assets/assets-content";
import { PageHeader } from "@/components/page-header";

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
export default async function AssetsPage() {
  const breakdown = await getAssetBreakdown();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="資産" icon={TrendingUp} />

      <AssetsContent breakdown={breakdown} />
    </div>
  );
}
