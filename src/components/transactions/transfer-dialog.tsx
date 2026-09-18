"use client";

import { ArrowDownUp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { markTransactionAsTransfer } from "@/actions/transactions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * 口座選択オプションの型定義である．
 */
type FilterOption = {
  id: string;
  label: string;
  subAccounts: Array<{ id: string; name: string }>;
};

/**
 * 振替設定ダイアログコンポーネントである．
 * 選択した明細を振替扱いに設定し，振替先口座を選択できる．
 */
export function TransferDialog({
  open,
  onOpenChange,
  transactionId,
  transactionDesc,
  sourceSubAccountId,
  filterOptions,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  transactionDesc: string;
  // 出金元明細自身のサブ口座（振替先候補から除外する）
  sourceSubAccountId: string | null;
  filterOptions: FilterOption[];
  onDone: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [selectedSubAccountId, setSelectedSubAccountId] = useState<string>("");
  const [selectedMainAccountId, setSelectedMainAccountId] =
    useState<string>("");

  // 親コンポーネントがダイアログを閉じてもマウントを維持するため，
  // 開くたびに選択をリセットする（別取引で開いた際に前の選択が
  // 引き継がれるのを防ぐ）。モダール表示のため open が true になる
  // たびに取引も切り替わる
  useEffect(() => {
    if (open) {
      setSelectedSubAccountId("");
      setSelectedMainAccountId("");
    }
  }, [open]);

  // 出金元明細自身のサブ口座は振替先候補から除外する
  // （選択して送信するまで「同じ口座には振替できません」エラーで
  //  失敗が分からないのを防ぐ）
  const availableSubAccounts = (
    selectedMainAccountId === "all" || selectedMainAccountId === ""
      ? filterOptions.flatMap(ma =>
          ma.subAccounts.map(sa => ({
            ...sa,
            mainLabel: ma.label,
          })),
        )
      : (
          filterOptions.find(ma => ma.id === selectedMainAccountId)
            ?.subAccounts ?? []
        ).map(sa => ({
          ...sa,
          mainLabel:
            filterOptions.find(ma => ma.id === selectedMainAccountId)?.label ??
            "",
        }))
  ).filter(sa => sa.id !== sourceSubAccountId);

  /**
   * 振替設定を実行するハンドラである．
   */
  const handleMarkTransfer = async () => {
    if (!selectedSubAccountId) {
      toast.error("振替先口座を選択してください．");
      return;
    }

    setIsPending(true);
    try {
      await markTransactionAsTransfer({
        transactionId,
        targetSubAccountId: selectedSubAccountId,
        createRule: true,
      });
      toast.success("振替扱いに設定しました．", {
        description: `"${transactionDesc}" が振替明細になり，自動で振替ルールが登録されました．`,
      });
      onOpenChange(false);
      onDone();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "振替設定に失敗しました．";
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4" />
            振替扱いに設定
          </DialogTitle>
          <DialogDescription>
            選択した口座へ振替扱いとして明細を追加します．
            <br />
            摘要: {transactionDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 金融機関選択 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-300">振替先金融機関</p>
            <Select
              value={selectedMainAccountId}
              onValueChange={val => {
                setSelectedMainAccountId(val);
                setSelectedSubAccountId("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="金融機関を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての金融機関</SelectItem>
                {filterOptions.map(ma => (
                  <SelectItem key={ma.id} value={ma.id}>
                    {ma.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 子口座選択 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-300">振替先子口座</p>
            <Select
              value={selectedSubAccountId}
              onValueChange={setSelectedSubAccountId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="子口座を選択" />
              </SelectTrigger>
              <SelectContent>
                {availableSubAccounts.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    子口座がありません
                  </SelectItem>
                ) : (
                  availableSubAccounts.map(sa => (
                    <SelectItem key={sa.id} value={sa.id}>
                      {sa.mainLabel}（{sa.name}）
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          {isPending ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              設定中...
            </div>
          ) : (
            <Button type="button" onClick={handleMarkTransfer}>
              振替設定する
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
