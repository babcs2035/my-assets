// ルート全体でクライアントエラーを捕捉し，Next.js デフォルトの英語エラー画面の代わりに
// 日本語の一貫したエラー表示と再試行手段を提供するエラーバウンダリである．
"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import logger from "@/lib/logger";

/**
 * クライアントサイドのエラーを表示するエラーバウンダリコンポーネントである．
 * error 詳細はログにのみ残し，画面上には再試行手段だけを表示する
 * （内部状態をユーザーに推測させないための共通表現）。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(
      { err: error },
      "🚨 Client-side error captured by error boundary",
    );
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <AlertTriangle className="h-10 w-10 text-red-400" />
      <div className="text-center space-y-1">
        <p className="text-base font-medium text-zinc-200">
          表示中に問題が発生しました
        </p>
        <p className="text-sm text-zinc-400">
          ページを再読み込みしても解決しない場合は，時間を空けてから再度お試しください．
        </p>
      </div>
      <Button type="button" onClick={() => reset()}>
        再試行する
      </Button>
    </div>
  );
}
