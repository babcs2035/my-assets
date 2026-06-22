/**
 * 毎日 08:00 JST に全プロバイダーの同期処理を自動実行するスケジューラである．
 * instrumentation.ts から Node.js ランタイムでのみ動的インポートされる．
 */

// 注意: このファイルは instrumentation.ts 経由で Edge Runtime でも解析されるため，
// Node.js 固有モジュールに依存するモジュールはトップレベルでインポートしない．
// prisma, mf-scraper は runAllProvidersSync 内で動的インポートする．

import type { Logger } from "pino";

let logger: Logger | null = null;

async function getLazyLogger(): Promise<Logger> {
  if (!logger) {
    const { default: pinoLogger } = await import("./logger");
    logger = pinoLogger;
  }
  return logger;
}

/**
 * JST での現在時刻を取得する関数である．
 */
function getNowJST(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utc + 9 * 60 * 60 * 1000);
}

/**
 * 次回の 08:00 JST までのミリ秒を計算する関数である．
 * 既に 08:00 を過ぎている場合は翌日の 08:00 を返す．
 */
function msUntilNext0800JST(): number {
  const nowJST = getNowJST();
  const target = new Date(nowJST);
  target.setHours(8, 0, 0, 0);

  if (nowJST >= target) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - nowJST.getTime();
}

/**
 * 全てのアクティブなプロバイダーの同期を実行する関数である．
 * 同期完了後に資産分析も自動的に実行する．
 */
async function runAllProvidersSync() {
  const logger = await getLazyLogger();
  logger.info("⏰ [Scheduler] Starting scheduled sync at 08:00 JST.");

  try {
    const { prisma } = await import("@/lib/prisma");
    const { runMfScraper } = await import("@/scraper/mf-scraper");

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

    for (const provider of providers) {
      logger.info(
        `⏰ [Scheduler] Syncing provider: [${provider.type}] ${provider.name}`,
      );

      try {
        const nowJST = getNowJST();
        await prisma.provider.update({
          where: { id: provider.id },
          data: { lastSyncAt: nowJST, lastSyncSuccess: null },
        });

        if (provider.type === "mf") {
          await runMfScraper(provider.name, undefined, { mode: "scheduled" });
        } else {
          logger.warn(
            `⏰ [Scheduler] Unknown provider type: ${provider.type}. Skipping.`,
          );
          continue;
        }

        await prisma.provider.update({
          where: { id: provider.id },
          data: { lastSyncAt: getNowJST(), lastSyncSuccess: true },
        });

        logger.info(
          { name: provider.name },
          "⏰ [Scheduler] ✅ Sync completed for provider.",
        );
      } catch (error) {
        logger.error(
          { err: error, name: provider.name },
          "⏰ [Scheduler] ❌ Sync failed for provider.",
        );

        try {
          await prisma.provider.update({
            where: { id: provider.id },
            data: { lastSyncAt: getNowJST(), lastSyncSuccess: false },
          });
        } catch {
          logger.error(
            { err: error },
            "⏰ [Scheduler] ❌ Failed to update sync status.",
          );
        }
      }
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
 * 08:00 JST に同期を実行するスケジューラを開始する関数である．
 * 最初の実行は次回の 08:00 JST に，その後は 24 時間ごとに繰り返す．
 */
export function startScheduler() {
  const msUntilNext = msUntilNext0800JST();
  const hoursUntilNext = (msUntilNext / (1000 * 60 * 60)).toFixed(2);

  setTimeout(async () => {
    void runAllProvidersSync();

    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setInterval(() => {
      void runAllProvidersSync();
    }, TWENTY_FOUR_HOURS);
  }, msUntilNext);

  getLazyLogger().then(l =>
    l.info(
      `⏰ [Scheduler] Next sync scheduled in ${hoursUntilNext} hours (08:00 JST).`,
    ),
  );
}
