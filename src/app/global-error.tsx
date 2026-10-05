// root layout 自体で起きた例外は error.tsx では受けられず，Next.js 既定の英語画面になるため，
// 日本語の表示と再試行手段を出すエラーバウンダリを置く．
// global-error は root layout の代わりに描画されるので，html・body・グローバル CSS を自分で読み込む
"use client";

import "./globals.css";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import logger from "@/lib/logger";

/**
 * root layout で発生したエラーを表示するエラーバウンダリコンポーネントである．
 * error.tsx と同じく，詳細はログにのみ残し，画面には再試行手段だけを出す．
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    logger.error(
      { err: error },
      "🚨 Root layout error captured by global error boundary",
    );
  }, [error]);

  return (
    <html lang="ja" className="dark">
      <body>
        {/* Client Component では metadata を export できないため，React の title で付ける */}
        <title>エラー | My Assets</title>
        <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-4">
          <AlertTriangle
            className="h-10 w-10 text-red-400"
            aria-hidden="true"
          />
          <div className="text-center space-y-1">
            <h1 className="text-base font-medium text-zinc-200">
              表示中に問題が発生しました
            </h1>
            <p className="text-sm text-zinc-400">
              ページを再読み込みしても解決しない場合は，時間を空けてから再度お試しください．
            </p>
          </div>
          {/* root layout が落ちた場合は描画し直すだけでは直らないため，内容を取り直す retry を使う */}
          <Button type="button" onClick={() => retry()}>
            再試行する
          </Button>
        </main>
      </body>
    </html>
  );
}
