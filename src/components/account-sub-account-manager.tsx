"use client";

import type { AssetType, SubAccount } from "@prisma/client";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { updateSubAccountAssetType } from "@/actions/accounts";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assetTypeColor, assetTypeLabel, formatCurrency } from "@/lib/utils";

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
    } catch (error) {
      console.error("❌ Failed to update asset type:", error);
      toast.error("資産区分の更新に失敗しました。");
    }
  };

  return (
    <div className="space-y-3">
      {/* セクション見出し */}
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Settings2 className="h-4 w-4" />
        子口座の管理
      </div>

      {/* 子口座リスト */}
      <div className="space-y-2">
        {subAccounts.map(sa => (
          <div
            key={sa.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              {/* 資産タイプに応じたカラーチップ */}
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: assetTypeColor(sa.assetType) }}
              />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  {sa.currentName}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatCurrency(sa.balance)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 現在の区分のバッジ表示 */}
              <Badge variant="secondary" className="text-[10px]">
                {assetTypeLabel(sa.assetType)}
              </Badge>

              {/* 区分変更用のセレクトボックス */}
              <Select
                defaultValue={sa.assetType}
                onValueChange={(val: string) =>
                  handleAssetTypeChange(sa.id, val as AssetType)
                }
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">預金・現金</SelectItem>
                  <SelectItem value="INVESTMENT">投資信託・証券</SelectItem>
                  <SelectItem value="CRYPTO">暗号資産</SelectItem>
                  <SelectItem value="POINT">ポイント</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
