/**
 * Next.js Instrumentation API のエントリポイントである．
 * サーバー起動時に一度だけ呼び出される．
 *
 * 注意: このファイルは Edge Runtime でもバンドルされるため，
 * Node.js 固有モジュール (node:crypto, node:child_process 等) を
 * トップレベルでインポートしてはならない．
 * Node.js 専用の処理は register() 内で動的インポートする．
 */
export async function register() {
  // サーバーサイド (Node.js) でのみスケジューラを起動する
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("⏰ [Scheduler] Initializing daily sync scheduler...");
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
