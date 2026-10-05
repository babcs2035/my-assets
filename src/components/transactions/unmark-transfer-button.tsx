"use client";

import { Loader2, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { unmarkTransfer } from "@/actions/transactions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * 振替を取り消すボタンと確認ダイアログである．
 * 手動の振替や振替ルールで振替にした明細の行に置き，振替でない状態に戻せるようにする（TX-3）．
 * 大きさは置き場所 (モバイルのカードかデスクトップの表か) で違うため，呼び出し元から受け取る．
 */
export function UnmarkTransferButton({
  transactionId,
  transactionDesc,
  className,
  onDone,
}: {
  transactionId: string;
  transactionDesc: string;
  className?: string;
  onDone: () => void;
}) {
  const [isPending, setIsPending] = useState(false);

  const handleUnmark = async () => {
    setIsPending(true);
    try {
      await unmarkTransfer(transactionId);
      toast.success("振替を取り消しました．");
      onDone();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "振替の取り消しに失敗しました．";
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 transition-colors hover:border-blue-500/50 hover:text-blue-400 disabled:opacity-50",
            className,
          )}
          aria-label="振替を取り消す"
          title="振替を取り消す"
          // 振替設定の後に，この明細のボタンへフォーカスを移すための目印 (TX-18)
          data-unmark-transfer-id={transactionId}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Undo2 className="h-3.5 w-3.5" />
          )}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>振替の取り消し</AlertDialogTitle>
          <AlertDialogDescription>
            「{transactionDesc}
            」の振替を取り消します．アプリで追加した相手側の明細は削除し，同期で取り込んだ明細は通常の明細に戻します．振替ルールは削除しないので，不要なら設定画面で削除してください．摘要に「振替」を含む同じ金融機関内の明細は，次の同期で再び振替になることがあります．
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction onClick={handleUnmark}>取り消す</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
