"use client";

import { ArrowDownUp, Loader2 } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

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
  returnFocusRef,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  transactionDesc: string;
  // 出金元明細自身のサブ口座（振替先候補から除外する）
  sourceSubAccountId: string | null;
  filterOptions: FilterOption[];
  // ダイアログを開いたボタン．DialogTrigger を使っていないため，閉じたときの戻り先を受け取る (TX-18)
  returnFocusRef: RefObject<HTMLElement | null>;
  onDone: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [selectedSubAccountId, setSelectedSubAccountId] = useState<string>("");
  const [selectedMainAccountId, setSelectedMainAccountId] =
    useState<string>("");
  // これまでは常にルールを作っていたので，初期値はオンにして同じ動作を保つ（TX-3）
  const [createRule, setCreateRule] = useState(true);
  // 振替設定が成功して閉じたかどうか．成功すると押したボタンは取り直しで消えるので，
  // 閉じたときにそこへは戻さず，親に移し先を任せる (TX-18)
  const succeededRef = useRef(false);

  // 親コンポーネントがダイアログを閉じてもマウントを維持するため，
  // 開くたびに選択をリセットする（別取引で開いた際に前の選択が
  // 引き継がれるのを防ぐ）。モダール表示のため open が true になる
  // たびに取引も切り替わる
  useEffect(() => {
    if (open) {
      succeededRef.current = false;
      setSelectedSubAccountId("");
      setSelectedMainAccountId("");
      setCreateRule(true);
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
        createRule,
      });
      toast.success("振替扱いに設定しました．", {
        description: createRule
          ? `"${transactionDesc}" が振替明細になり，振替ルールを登録しました．`
          : `"${transactionDesc}" が振替明細になりました．`,
      });
      succeededRef.current = true;
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
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={event => {
          // Radix は DialogTrigger にしかフォーカスを戻さず，ここでは使っていないので，
          // そのままでは閉じ方に関係なく body に落ちる (TX-18)
          event.preventDefault();
          if (!succeededRef.current) returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4" />
            振替扱いに設定
          </DialogTitle>
          <DialogDescription>
            振替先の子口座にある同じ日付・逆符号・同額の明細と結びます．見つからなければ相手側の明細を追加します．
            <br />
            摘要: {transactionDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 金融機関選択 */}
          <div className="space-y-2">
            <Label
              htmlFor="transfer-main-account"
              className="text-sm font-medium text-zinc-300"
            >
              振替先金融機関
            </Label>
            <Select
              value={selectedMainAccountId}
              onValueChange={val => {
                setSelectedMainAccountId(val);
                setSelectedSubAccountId("");
              }}
            >
              <SelectTrigger id="transfer-main-account" className="w-full">
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
            <Label
              htmlFor="transfer-sub-account"
              className="text-sm font-medium text-zinc-300"
            >
              振替先子口座
            </Label>
            <Select
              value={selectedSubAccountId}
              onValueChange={setSelectedSubAccountId}
            >
              <SelectTrigger id="transfer-sub-account" className="w-full">
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

          {/* 振替ルールの作成 */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Label
                htmlFor="transfer-create-rule"
                className="text-sm font-medium text-zinc-300"
              >
                同じ摘要の振替ルールを作成する
              </Label>
              <p className="text-xs text-zinc-400">
                この摘要の既存の振替ルールは，この振替先のルールに置き換わります．
              </p>
            </div>
            <Switch
              id="transfer-create-rule"
              checked={createRule}
              onCheckedChange={setCreateRule}
            />
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
