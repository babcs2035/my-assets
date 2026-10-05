"use client";

import type { AssetType, SubAccount } from "@prisma/client";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  reorderSubAccounts,
  updateSubAccountAssetType,
  updateSubAccountHidden,
} from "@/actions/accounts";
import { Button } from "@/components/ui/button";
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
  onSubAccountsChanged,
}: {
  subAccounts: SubAccountWithRelations[];
  mainAccountId: string;
  /** 変更後に詳細ページのグラフと合計へ反映するため，口座データを取り直すコールバック */
  onSubAccountsChanged: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState(subAccounts);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // props が更新されたら（onSubAccountsChanged で取り直した残高・区分など）
  // ローカル状態を同期する（useState(props) は初回のみ参照される）
  useEffect(() => {
    setItems(subAccounts);
  }, [subAccounts]);

  /**
   * 子口座の資産区分を変更した際に実行されるハンドラである．
   * @param subAccountId - 資産区分を変更する子口座のID．
   * @param newType - 新しい資産区分．
   */
  const handleAssetTypeChange = async (
    subAccountId: string,
    newType: AssetType,
  ) => {
    try {
      await updateSubAccountAssetType(subAccountId, newType);
      // Select は制御コンポーネントなので，楽観的にローカル状態も更新する
      setItems(prev =>
        prev.map(item =>
          item.id === subAccountId ? { ...item, assetType: newType } : item,
        ),
      );
      toast.success("資産区分を更新しました．");
      await onSubAccountsChanged();
    } catch {
      toast.error("資産区分の更新に失敗しました．");
      setItems(subAccounts);
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

  const saveSubAccountOrder = (orderedItems: SubAccountWithRelations[]) => {
    setItems(orderedItems);
    const orderedIds = orderedItems.map(item => item.id);
    startTransition(async () => {
      try {
        await reorderSubAccounts(orderedIds);
        toast.success("並び順を更新しました．");
        await onSubAccountsChanged();
      } catch {
        toast.error("並び順の更新に失敗しました．");
        setItems(subAccounts);
      }
    });
  };

  const handleDragEnd = () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);
    saveSubAccountOrder(items);
  };

  // HTML5 DnD はタッチでもキーボードでも動かないため，ボタンでも 1 つずつ動かせるようにする (ACC-11)
  const moveSubAccount = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const newItems = [...items];
    [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
    saveSubAccountOrder(newItems);
  };

  const handleHiddenChange = async (
    subAccountId: string,
    isHidden: boolean,
  ) => {
    try {
      await updateSubAccountHidden(subAccountId, isHidden);
      setItems(prev =>
        prev.map(item =>
          item.id === subAccountId ? { ...item, isHidden } : item,
        ),
      );
      toast.success(
        isHidden ? "子口座を非表示にしました．" : "子口座を表示にしました．",
      );
      await onSubAccountsChanged();
    } catch {
      toast.error("表示設定の更新に失敗しました．");
    }
  };

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-400">
        子口座が登録されていません
      </p>
    );
  }

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
          className={`flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 px-4 py-3 cursor-grab active:cursor-grabbing transition-opacity ${
            isPending ? "opacity-50" : ""
          } ${draggedIndex === index ? "opacity-50 scale-[0.98]" : ""}`}
          style={{
            background: `linear-gradient(to right, ${assetTypeColor(sa.assetType)}15 0%, transparent 100%)`,
            borderLeft: `3px solid ${assetTypeColor(sa.assetType)}`,
          }}
        >
          {/* ドラッグハンドル（HTML5 DnD はタッチ非対応のためモバイルでは非表示） */}
          <GripVertical className="hidden h-4 w-4 text-zinc-400 shrink-0 md:block" />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">
              {sa.currentName}
            </p>
            <p className="text-xs text-zinc-400 font-mono">
              {formatCurrency(sa.balance)}
            </p>
          </div>

          {/* モバイルではコントロールを 2 行目に折り返す（口座名の表示幅確保） */}
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => moveSubAccount(index, -1)}
                disabled={isPending || index === 0}
                aria-label={`${sa.currentName} を上へ移動`}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => moveSubAccount(index, 1)}
                disabled={isPending || index === items.length - 1}
                aria-label={`${sa.currentName} を下へ移動`}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">非表示</span>
              <Switch
                checked={sa.isHidden}
                aria-label={`${sa.currentName} を非表示にする`}
                onCheckedChange={checked => handleHiddenChange(sa.id, checked)}
              />
            </div>

            {/* 区分変更用のセレクトボックス */}
            <Select
              value={sa.assetType}
              onValueChange={(val: string) =>
                handleAssetTypeChange(sa.id, val as AssetType)
              }
            >
              <SelectTrigger className="h-8 w-[120px] text-xs shrink-0 sm:w-[140px]">
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
