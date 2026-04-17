"use client";

import type { AssetType, SubAccount } from "@prisma/client";
import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  reorderSubAccounts,
  updateSubAccountHidden,
  updateSubAccountAssetType,
} from "@/actions/accounts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { assetTypeColor, formatCurrency } from "@/lib/utils";

/**
 * 子口座のリレーションを含む型定義である．
 */
type SubAccountWithRelations = SubAccount & {
  holdings: unknown[];
  cryptos: unknown[];
  pointDetail: unknown | null;
};

/**
 * 金融機関配下の子口座を管理するためのコンポーネントである．
 * 各子口座の資産区分の変更や，現在の残高の確認を行うことができる．
 */
export function AccountSubAccountManager({
  subAccounts,
}: {
  subAccounts: SubAccountWithRelations[];
  mainAccountId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState(subAccounts);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  /**
   * 子口座の資産区分を変更した際に実行されるハンドラである。
   * @param subAccountId - 資産区分を変更する子口座のID。
   * @param newType - 新しい資産区分。
   */
  const handleAssetTypeChange = async (
    subAccountId: string,
    newType: AssetType,
  ) => {
    console.log(
      `🔄 Attempting to update asset type for sub-account ${subAccountId} to ${newType}.`,
    );
    try {
      await updateSubAccountAssetType(subAccountId, newType);
      toast.success("資産区分を更新しました。");
      console.log("✅ Asset type updated successfully.");
      // Server Component を再フェッチしてグラフの色を即座に更新する
      router.refresh();
    } catch (error) {
      console.error("❌ Failed to update asset type:", error);
      toast.error("資産区分の更新に失敗しました。");
    }
  };

  const handleDragStart = (index: number) => {
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
        await reorderSubAccounts(orderedIds);
        toast.success("並び順を更新しました。");
        router.refresh();
      } catch (error) {
        console.error("❌ Failed to reorder:", error);
        toast.error("並び順の更新に失敗しました。");
        setItems(subAccounts);
      }
    });
  };

  const handleHiddenChange = async (subAccountId: string, isHidden: boolean) => {
    try {
      await updateSubAccountHidden(subAccountId, isHidden);
      setItems(prev =>
        prev.map(item =>
          item.id === subAccountId ? { ...item, isHidden } : item,
        ),
      );
      toast.success(isHidden ? "子口座を非表示にしました。" : "子口座を表示にしました。");
      router.refresh();
    } catch (error) {
      console.error("❌ Failed to update hidden state:", error);
      toast.error("表示設定の更新に失敗しました。");
    }
  };

  return (
    <div className="space-y-2">
      {/* 子口座リスト */}
      {items.map((sa, index) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop requires these handlers
        <div
          key={sa.id}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={e => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          className={`flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-4 py-3 cursor-grab active:cursor-grabbing transition-opacity ${
            isPending ? "opacity-50" : ""
          } ${draggedIndex === index ? "opacity-50 scale-[0.98]" : ""}`}
          style={{
            background: `linear-gradient(to right, ${assetTypeColor(sa.assetType)}15 0%, transparent 100%)`,
            borderLeft: `3px solid ${assetTypeColor(sa.assetType)}`,
          }}
        >
          {/* ドラッグハンドル */}
          <GripVertical className="h-4 w-4 text-zinc-500 shrink-0" />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">
              {sa.currentName}
            </p>
            <p className="text-xs text-zinc-500 font-mono">
              {formatCurrency(sa.balance)}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">非表示</span>
              <Switch
                checked={sa.isHidden}
                onCheckedChange={checked => handleHiddenChange(sa.id, checked)}
              />
            </div>

            {/* 区分変更用のセレクトボックス */}
            <Select
              defaultValue={sa.assetType}
              onValueChange={(val: string) =>
                handleAssetTypeChange(sa.id, val as AssetType)
              }
            >
              <SelectTrigger className="h-8 w-[140px] text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">預金・現金</SelectItem>
                <SelectItem value="INVESTMENT">投資信託・証券</SelectItem>
                <SelectItem value="CRYPTO">暗号資産</SelectItem>
                <SelectItem value="POINT">ポイント</SelectItem>
                <SelectItem value="LIABILITY">負債</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
}
