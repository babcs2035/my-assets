"use client";

import type { MainAccount, Provider, SubAccount } from "@prisma/client";
import { ChevronRight, GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reorderMainAccounts } from "@/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assetTypeColor, assetTypeLabel, formatCurrency } from "@/lib/utils";

type AccountWithRelations = MainAccount & {
  provider: Provider;
  subAccounts: (SubAccount & {
    holdings: unknown[];
    cryptos: unknown[];
    pointDetail: unknown | null;
  })[];
};

/**
 * 口座一覧コンポーネントである．
 * ガイドブック:
 *   - 不要な装飾を排除（グラデーションアイコン等）
 *   - 金額を最も目立つ位置に
 *   - 意味のある順列（ドラッグ並び替え維持）
 */
export function AccountList({
  accounts,
}: {
  accounts: AccountWithRelations[];
}) {
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
      } catch (error) {
        console.error("❌ Failed to reorder:", error);
        toast.error("並び順の更新に失敗しました。");
        setItems(accounts);
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
              className="h-full kpi-card cursor-grab active:cursor-grabbing"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="h-4 w-4 text-zinc-600 shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">
                        {account.label}
                      </CardTitle>
                      <p className="text-xs text-zinc-500">
                        {account.provider.name} · {account.subAccounts.length} 子口座
                      </p>
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
              <CardContent>
                <Link href={`/accounts/${account.id}`}>
                  {/* ガイドブック: 数値を最も目立たせる */}
                  <p className="text-2xl font-bold tracking-tight text-zinc-50 font-mono">
                    {formatCurrency(totalBalance)}
                  </p>

                  {/* 子口座タグ */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {account.subAccounts.slice(0, 5).map(sa => (
                      <Badge
                        key={sa.id}
                        variant="secondary"
                        className="text-xs max-w-[180px] truncate"
                        style={{
                          background: `${assetTypeColor(sa.assetType)}15`,
                          borderColor: `${assetTypeColor(sa.assetType)}60`,
                          color: assetTypeColor(sa.assetType),
                        }}
                      >
                        {sa.currentName}
                      </Badge>
                    ))}
                    {account.subAccounts.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{account.subAccounts.length - 5}
                      </Badge>
                    )}
                  </div>

                  {/* 資産タイプ別の内訳 */}
                  <div className="mt-3 space-y-1">
                    {(["CASH", "INVESTMENT", "CRYPTO", "POINT"] as const).map(
                      type => {
                        const typeBalance = account.subAccounts
                          .filter(sa => sa.assetType === type)
                          .reduce((s, sa) => s + sa.balance, 0);
                        if (typeBalance === 0) return null;
                        return (
                          <div
                            key={type}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ background: assetTypeColor(type) }}
                              />
                              <span className="text-zinc-400">
                                {assetTypeLabel(type)}
                              </span>
                            </span>
                            <span className="font-mono text-zinc-300">
                              {formatCurrency(typeBalance)}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                </Link>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
