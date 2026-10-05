"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { getAccounts } from "@/actions/accounts";
import { getCategories, getCategoryRules } from "@/actions/categories";
import { getProviders } from "@/actions/providers";
import { getTransferRules } from "@/actions/transactions";
import { AccountSection } from "@/components/settings/account-section";
import { CategoryRuleSection } from "@/components/settings/category-rule-section";
import { CategorySection } from "@/components/settings/category-section";
import { ProviderSection } from "@/components/settings/provider-section";
import { TransferRuleSection } from "@/components/settings/transfer-rule-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Types
type Provider = Awaited<ReturnType<typeof getProviders>>[number];
type Account = Awaited<ReturnType<typeof getAccounts>>[number];
type Category = Awaited<ReturnType<typeof getCategories>>[number];
type CategoryRule = Awaited<ReturnType<typeof getCategoryRules>>[number];
type TransferRule = Awaited<ReturnType<typeof getTransferRules>>[number];

export function SettingsContent() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  // 初期値 true で初回 fetch 中の空状態フラッシュを防ぐ
  const [isLoading, setIsLoading] = useState(true);
  // 初回の取得が終わるまでは各セクションを描画しない．空の一覧から伸びるとレイアウトがずれ (SET-2)，
  // 取得に失敗すると「〜がありません」と誤って表示され，再試行の手段もなかった (SET-3)
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [, startTransition] = useTransition();

  // Transfer Rule State
  const [transferRules, setTransferRules] = useState<TransferRule[]>([]);

  // 書き込みのたびに fetchData で取り直すため，連続した操作で古い応答が
  // 新しい応答を上書きしないよう，リクエストの順序を管理する
  const requestIdRef = useRef(0);

  /**
   * 必要な初期データをサーバーアクションからまとめて取得する関数である．
   */
  const fetchData = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    startTransition(async () => {
      try {
        const [p, a, c, r, t] = await Promise.all([
          getProviders(),
          getAccounts(),
          getCategories(),
          getCategoryRules(),
          getTransferRules(),
        ]);
        if (requestId !== requestIdRef.current) return;
        setProviders(p);
        setAccounts(a);
        setCategories(c);
        setRules(r);
        setTransferRules(t);
        setHasLoaded(true);
        setLoadFailed(false);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setLoadFailed(true);
        toast.error("設定データのフェッチに失敗しました．");
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!hasLoaded) {
    if (loadFailed && !isLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-red-400">
            設定データを取得できませんでした．
          </p>
          <Button variant="outline" size="sm" onClick={fetchData}>
            再試行する
          </Button>
        </div>
      );
    }
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-8">
        <ProviderSection
          providers={providers}
          isLoading={isLoading}
          onChanged={fetchData}
        />

        <AccountSection
          accounts={accounts}
          providers={providers}
          onChanged={fetchData}
        />

        <CategorySection categories={categories} onChanged={fetchData} />

        <CategoryRuleSection
          categories={categories}
          rules={rules}
          onChanged={fetchData}
        />

        <TransferRuleSection
          accounts={accounts}
          transferRules={transferRules}
          onChanged={fetchData}
        />
      </div>
    </div>
  );
}

/**
 * 設定ページのスケルトンローディングである．
 * 初回の取得が終わるまで，5 つのセクションの代わりに表示する．
 */
function SettingsSkeleton() {
  return (
    <div className="grid gap-8">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-[300px] w-full" />
      ))}
    </div>
  );
}
