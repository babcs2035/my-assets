import { Settings as SettingsLucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SettingsContent } from "@/components/settings/settings-content";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

/**
 * 設定ページメタデータである．
 */
export const metadata: Metadata = {
  title: "設定 | My Assets",
  description: "カテゴリーと自動分類ルールを管理する",
};

/**
 * 設定ページコンポーネントである．
 * ガイドブック: タイトルにページの内容を正確に表記する．
 */
export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="設定" icon={SettingsLucideIcon} />

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        }
      >
        <SettingsContent />
      </Suspense>
    </div>
  );
}
