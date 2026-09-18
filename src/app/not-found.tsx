// Next.js デフォルトの英語 404 画面の代わりに，日本語の一貫した 404 画面を提供する．

import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 404（ページが存在しない）画面である．
 * アプリのダークテーマに合わせた表示とトップページへの導線を提供する．
 */
export default function NotFound() {
  return (
    // data-myassets-not-found は sync-status.tsx が 404 画面での
    // サーバーアクション呼び出し（POST が 404 になる）をスキップするための
    // 検知用マーカーである．
    <div
      data-myassets-not-found
      className="flex flex-col items-center justify-center gap-4 py-24"
    >
      <FileQuestion className="h-10 w-10 text-zinc-500" />
      <div className="text-center space-y-1">
        <p className="text-base font-medium text-zinc-200">
          お探しのページが見つかりません
        </p>
        <p className="text-sm text-zinc-400">
          URL が変更されたか，存在しないページです．
        </p>
      </div>
      <Button asChild>
        <Link href="/">トップページへ戻る</Link>
      </Button>
    </div>
  );
}
