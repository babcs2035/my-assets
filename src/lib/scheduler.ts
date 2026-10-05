/**
 * 毎日 08:00 JST に全プロバイダーの同期処理を自動実行するスケジューラである．
 * instrumentation.ts から Node.js ランタイムでのみ動的インポートされる．
 */

// 注意: このファイルは instrumentation.ts 経由で Edge Runtime でも解析されるため，
// Node.js 固有モジュールに依存するモジュールはトップレベルでインポートしない．
// prisma, mf-scraper は runAllProvidersSync 内で動的インポートする．

import type { Logger } from "pino";
import { retrieveTodaySyncTimeJST } from "./utils";

let logger: Logger | null = null;

async function getLazyLogger(): Promise<Logger> {
  if (!logger) {
    const { default: pinoLogger } = await import("./logger");
    logger = pinoLogger;
  }
  return logger;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * 次回の 08:00 JST までのミリ秒を計算する関数である．
 * 既に 08:00 を過ぎている場合は翌日の 08:00 を返す．
 */
function msUntilNext0800JST(): number {
  const now = Date.now();
  let target = retrieveTodaySyncTimeJST().getTime();
  if (now >= target) {
    target += ONE_DAY_MS;
  }
  return target - now;
}

/**
 * 全てのアクティブなプロバイダーの同期を実行する関数である．
 * 同期完了後に資産分析も自動的に実行する．
 * `skipSyncedSince` を渡すと，その時刻以降に同期を始めたプロバイダーを飛ばす（再起動時のキャッチアップで使う）．
 */
async function runAllProvidersSync(options: { skipSyncedSince?: Date } = {}) {
  const logger = await getLazyLogger();
  logger.info(
    options.skipSyncedSince
      ? "⏰ [Scheduler] Starting catch-up sync for today's 08:00 JST run."
      : "⏰ [Scheduler] Starting scheduled sync at 08:00 JST.",
  );

  try {
    const { prisma } = await import("@/lib/prisma");
    const { runMfScraper } = await import("@/scraper/mf-scraper");
    const { acquireSyncLock, releaseSyncLock } = await import(
      "@/lib/sync-lock"
    );

    const providers = await prisma.provider.findMany({
      where: { isActive: true },
    });

    if (providers.length === 0) {
      logger.warn("⏰ [Scheduler] No active providers found. Skipping sync.");
      return;
    }

    logger.info(
      `⏰ [Scheduler] Found ${providers.length} active provider(s). Starting sync...`,
    );

    let attemptedCount = 0;
    for (const provider of providers) {
      // ロックを取る前に判定する．取ってから飛ばすと「同期中」のまま残る
      if (provider.type !== "mf") {
        logger.warn(
          `⏰ [Scheduler] Provider type ${provider.type} is not synced by the scheduler. Skipping.`,
        );
        continue;
      }

      // lastSyncAt はロックの取得と解放で更新されるので，失敗した同期や手動同期も「同期を始めた」に含まれる．
      // 失敗した同期を再起動のたびにやり直すと，そのたびに MF へのログインと OTP の送信が起きる
      if (
        options.skipSyncedSince &&
        provider.lastSyncAt &&
        provider.lastSyncAt >= options.skipSyncedSince
      ) {
        logger.info(
          { name: provider.name, lastSyncAt: provider.lastSyncAt },
          "⏰ [Scheduler] Provider already synced since today's 08:00 JST. Skipping.",
        );
        continue;
      }

      logger.info(
        `⏰ [Scheduler] Syncing provider: [${provider.type}] ${provider.name}`,
      );

      let lockedAt: Date | null = null;
      try {
        lockedAt = await acquireSyncLock(provider.id);
        if (!lockedAt) {
          logger.warn(
            { name: provider.name },
            "⏰ [Scheduler] Another sync is running for provider. Skipping.",
          );
          continue;
        }

        attemptedCount++;
        await runMfScraper(provider.name, undefined, { mode: "scheduled" });
        await releaseSyncLock(provider.id, lockedAt, true);

        logger.info(
          { name: provider.name },
          "⏰ [Scheduler] ✅ Sync completed for provider.",
        );
      } catch (error) {
        logger.error(
          { err: error, name: provider.name },
          "⏰ [Scheduler] ❌ Sync failed for provider.",
        );

        if (lockedAt) {
          try {
            await releaseSyncLock(provider.id, lockedAt, false);
          } catch (releaseError) {
            logger.error(
              { err: releaseError },
              "⏰ [Scheduler] ❌ Failed to update sync status.",
            );
          }
        }
      }
    }

    // キャッチアップで同期したプロバイダーがなければ，資産分析もその日の分が済んでいる
    if (options.skipSyncedSince && attemptedCount === 0) {
      logger.info("⏰ [Scheduler] Nothing to catch up.");
      return;
    }

    logger.info("⏰ [Scheduler] ✅ All scheduled syncs completed.");

    // ── 同期完了後に資産分析を実行 ────────────────────────
    logger.info("⏰ [Scheduler] Running asset analysis after sync...");
    try {
      const { runAssetAnalysis } = await import("@/actions/analysis");
      const result = await runAssetAnalysis();

      if (result.success) {
        logger.info("⏰ [Scheduler] ✅ Asset analysis completed.");
      } else {
        logger.error(
          { error: result.error },
          "⏰ [Scheduler] ❌ Asset analysis failed.",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "⏰ [Scheduler] ❌ Asset analysis failed.");
    }
  } catch (error) {
    logger.error({ err: error }, "⏰ [Scheduler] ❌ Scheduled sync failed.");
  }
}

/**
 * 次の 08:00 JST に同期を実行するタイマーを張る関数である．
 * setInterval の 24 時間ごとでは同期にかかった時間やタイマーの遅れが積み重なるので，
 * 実行が終わるたびに次の 08:00 JST を計算し直す
 */
function scheduleNextSync() {
  const msUntilNext = msUntilNext0800JST();
  const hoursUntilNext = (msUntilNext / ONE_HOUR_MS).toFixed(2);

  setTimeout(async () => {
    try {
      await runAllProvidersSync();
    } finally {
      scheduleNextSync();
    }
  }, msUntilNext);

  getLazyLogger().then(l =>
    l.info(
      `⏰ [Scheduler] Next sync scheduled in ${hoursUntilNext} hours (08:00 JST).`,
    ),
  );
}

// register() が dev のホットリロード等で複数回呼ばれた場合に備え，
// タイマーの重複生成を防ぐためのフラグである．
let schedulerStarted = false;

/**
 * 08:00 JST に同期を実行するスケジューラを開始する関数である．
 * 本番では，今日の 08:00 JST を過ぎてから起動した場合に，その日の同期を始めていないプロバイダーをすぐ同期する．
 * 開発中は `pnpm dev` を再起動するたびに MF へログインしないよう，キャッチアップしない．
 * 冪等であり，2 回目以降の呼び出しは何もしない．
 */
export function startScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;

  const todaySyncTime = retrieveTodaySyncTimeJST();
  if (
    process.env.NODE_ENV === "production" &&
    Date.now() >= todaySyncTime.getTime()
  ) {
    void runAllProvidersSync({ skipSyncedSince: todaySyncTime });
  }

  scheduleNextSync();
}
