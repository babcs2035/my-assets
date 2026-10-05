"use client";

import { useEffect, useState } from "react";
import { getAccountList } from "@/actions/accounts";
import { AccountList } from "@/components/accounts/account-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 口座一覧ページのコンテンツコンポーネントである．
 * クライアントサイドでデータをフェッチし，AccountList に渡す．
 */
export function AccountsPageContent() {
  const [accounts, setAccounts] = useState<Awaited<
    ReturnType<typeof getAccountList>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  // エラー時の再試行用（増やすとフェッチ effect が再実行される）
  const [reloadKey, setReloadKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey は再試行トリガーであり，effect 本体では使用しない
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAccountList();
        if (!cancelled) setAccounts(data);
      } catch {
        if (!cancelled) setError("データの取得に失敗しました．");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm text-red-400">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setReloadKey(k => k + 1);
          }}
        >
          再試行する
        </Button>
      </div>
    );
  }

  if (!accounts) {
    return <AccountsPageSkeleton />;
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-zinc-400">まだ口座が登録されていません</p>
        <p className="text-xs text-zinc-400 mt-2">
          設定ページから口座を追加してください
        </p>
      </div>
    );
  }

  return <AccountList accounts={accounts} />;
}

/**
 * 口座一覧ページのスケルトンローディングである．
 */
function AccountsPageSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-48 w-full" />
      ))}
    </div>
  );
}
