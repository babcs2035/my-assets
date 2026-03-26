"use client";

import type { AssetType, SubAccount } from "@prisma/client";
import { toast } from "sonner";
import { updateSubAccountAssetType } from "@/actions/accounts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="space-y-2">
      {/* 子口座リスト */}
      {subAccounts.map(sa => (
        <div
          key={sa.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-4 py-3"
          style={{
            background: `linear-gradient(to right, ${assetTypeColor(sa.assetType)}15 0%, transparent 100%)`,
            borderLeft: `3px solid ${assetTypeColor(sa.assetType)}`,
          }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">
              {sa.currentName}
            </p>
            <p className="text-xs text-zinc-500 font-mono">
              {formatCurrency(sa.balance)}
            </p>
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
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
