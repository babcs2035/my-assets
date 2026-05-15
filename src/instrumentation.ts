/**
 * Next.js Instrumentation API のエントリポイントである．
 * サーバー起動時に一度だけ呼び出される．
 *
 * 注意: このファイルは Edge Runtime でもバンドルされるため，
 * Node.js 固有モジュール (node:crypto, node:child_process 等) を
 * トップレベルでインポートしてはならない．
 * Node.js 専用の処理は register() 内で動的インポートする．
 */
import logger from "./lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    logger.info("⏰ [Scheduler] Initializing daily sync scheduler.");
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
