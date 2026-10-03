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
      } catch {
        if (requestId !== requestIdRef.current) return;
        toast.error("設定データのフェッチに失敗しました．");
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
