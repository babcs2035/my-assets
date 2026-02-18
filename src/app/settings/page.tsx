import { Suspense } from "react";
import { SettingsContent } from "@/components/settings/settings-content";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          設定
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          カテゴリーと自動分類ルールを管理します
        </p>
      </div>

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
