"use client";

import { ChevronRight, GripVertical, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reorderMainAccounts } from "@/actions/accounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assetTypeColor, formatCurrency } from "@/lib/utils";

type BillingSummary = {
  totalBilling: number;
  recentBillings: Array<{
    subAccountName: string;
    amount: number;
    billingDate: Date;
  }>;
};

type AccountListItem = {
  id: string;
  label: string;
  sortOrder: number;
  provider: { name: string };
  subAccounts: Array<{
    id: string;
    currentName: string;
    balance: number;
    assetType: "CASH" | "INVESTMENT" | "CRYPTO" | "POINT" | "LIABILITY";
    mainAccountId: string;
    sortOrder: number;
  }>;
  billingSummary: BillingSummary | null;
};

/**
 * 口座一覧コンポーネントである．
 * ガイドブック:
 *   - 不要な装飾を排除（グラデーションアイコン等）
 *   - 金額を最も目立つ位置に
 *   - 意味のある順列（ドラッグ並び替え維持）
 */
export function AccountList({ accounts }: { accounts: AccountListItem[] }) {
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState(accounts);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);
    setItems(newItems);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);

    const orderedIds = items.map(item => item.id);
    startTransition(async () => {
      try {
        await reorderMainAccounts(orderedIds);
        toast.success("並び順を更新しました。");
        router.refresh();
      } catch {
        toast.error("並び順の更新に失敗しました。");
        setItems(accounts);
      }
    });
  };

  return (
    <div className="relative grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">読み込み中...</span>
          </div>
        </div>
      )}
      {items.map((account, idx) => {
        const totalBalance = account.subAccounts.reduce(
          (sum, sa) => sum + sa.balance,
          0,
        );

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop requires these handlers
          <div
            key={account.id}
            draggable
            onDragStart={e => handleDragStart(e, idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`group transition-opacity ${
              isPending ? "opacity-50" : ""
            } ${draggedIndex === idx ? "opacity-50 scale-[0.98]" : ""}`}
          >
            <Card
              className="kpi-card cursor-grab active:cursor-grabbing gap-0"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <CardHeader className="gap-0 py-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="h-4 w-4 text-zinc-600 shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">
                        {account.label}
                      </CardTitle>
                    </div>
                  </div>
                  <Link
                    href={`/accounts/${account.id}`}
                    onClick={e => e.stopPropagation()}
                  >
                    <ChevronRight className="h-4 w-4 text-zinc-600 transition-transform hover:translate-x-0.5 hover:text-zinc-400" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Link href={`/accounts/${account.id}`}>
                  {/* ガイドブック: 数値を最も目立たせる */}
                  <p className="text-2xl font-bold tracking-tight text-zinc-50 font-mono">
                    {formatCurrency(totalBalance)}
                  </p>

                  {/* 子口座別の残高 */}
                  <div className="mt-3 space-y-1">
                    {account.subAccounts.map(sa => (
                      <div
                        key={sa.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: assetTypeColor(sa.assetType) }}
                          />
                          <span className="text-zinc-400 truncate">
                            {sa.currentName}
                          </span>
                        </span>
                        <span className="font-mono text-zinc-300">
                          {formatCurrency(sa.balance)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* クレジットカード請求情報 */}
                  {account.billingSummary &&
                    account.billingSummary.recentBillings.length > 0 &&
                    (() => {
                      const now = new Date();
                      const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                      const thisMonthBillings =
                        account.billingSummary.recentBillings.filter(b => {
                          const d = new Date(b.billingDate);
                          return (
                            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` ===
                            thisMonthKey
                          );
                        });
                      const thisMonthTotal = thisMonthBillings.reduce(
                        (sum, b) => sum + b.amount,
                        0,
                      );

                      return (
                        <div className="mt-3 pt-3 border-t border-zinc-700/50">
                          <div className="mb-1.5 text-xs font-medium text-zinc-400">
                            クレジットカード請求
                          </div>
                          {account.billingSummary.recentBillings.map(b => (
                            <div
                              key={b.subAccountName}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-zinc-400 truncate">
                                  {b.subAccountName}
                                </span>
                                <span className="ml-1.5 text-[11px] text-zinc-500">
                                  {fmtDate(new Date(b.billingDate))}
                                </span>
                              </div>
                              <span className="font-mono text-red-400 text-sm shrink-0 ml-2">
                                {formatCurrency(b.amount)}
                              </span>
                            </div>
                          ))}
                          {thisMonthBillings.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-zinc-700/30 flex items-center justify-between text-sm font-medium">
                              <span className="text-zinc-300">今月合計</span>
                              <span className="font-mono text-red-300">
                                {formatCurrency(thisMonthTotal)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </Link>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
