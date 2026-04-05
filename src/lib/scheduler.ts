/**
 * 毎日 08:00 JST に全プロバイダーの同期処理を自動実行するスケジューラである．
 * instrumentation.ts から Node.js ランタイムでのみ動的インポートされる．
 */

// 注意: このファイルは instrumentation.ts 経由で Edge Runtime でも解析されるため，
// Node.js 固有モジュールに依存するモジュールはトップレベルでインポートしない．
// prisma, mf-scraper は runAllProvidersSync 内で動的インポートする．

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

  // 既に 08:00 を過ぎている場合は翌日に設定する
  if (nowJST >= target) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - nowJST.getTime();
}

/**
 * 全てのアクティブなプロバイダーの同期を実行する関数である．
 */
async function runAllProvidersSync() {
  console.log("⏰ [Scheduler] Starting scheduled sync at 08:00 JST...");

  try {
    // Node.js 固有モジュールに依存するため，実行時に動的インポートする
    const { prisma } = await import("@/lib/prisma");
    const { runMfScraper } = await import("@/scraper/mf-scraper");

    const providers = await prisma.provider.findMany({
      where: { isActive: true },
    });

    if (providers.length === 0) {
      console.warn("⏰ [Scheduler] No active providers found. Skipping sync.");
      return;
    }

    console.log(
      `⏰ [Scheduler] Found ${providers.length} active provider(s). Starting sync...`,
    );

    for (const provider of providers) {
      console.log(
        `⏰ [Scheduler] Syncing provider: [${provider.type}] ${provider.name}`,
      );

      try {
        // 同期開始を記録する
        const nowJST = getNowJST();
        await prisma.provider.update({
          where: { id: provider.id },
          data: {
            lastSyncAt: nowJST,
            lastSyncSuccess: null,
          },
        });

        if (provider.type === "mf") {
          await runMfScraper(provider.name);
        } else {
          console.warn(
            `⏰ [Scheduler] Unknown provider type: ${provider.type}. Skipping.`,
          );
          continue;
        }

        // 同期成功を記録する
        await prisma.provider.update({
          where: { id: provider.id },
          data: {
            lastSyncAt: getNowJST(),
            lastSyncSuccess: true,
          },
        });

        console.log(
          `⏰ [Scheduler] ✅ Sync completed for provider: ${provider.name}`,
        );
      } catch (error) {
        console.error(
          `⏰ [Scheduler] ❌ Sync failed for provider: ${provider.name}`,
          error,
        );

        // 同期失敗を記録する
        try {
          await prisma.provider.update({
            where: { id: provider.id },
            data: {
              lastSyncAt: getNowJST(),
              lastSyncSuccess: false,
            },
          });
        } catch (updateError) {
          console.error(
            `⏰ [Scheduler] ❌ Failed to update sync status:`,
            updateError,
          );
        }
      }
    }

    console.log("⏰ [Scheduler] ✅ All scheduled syncs completed.");
  } catch (error) {
    console.error("⏰ [Scheduler] ❌ Scheduled sync failed:", error);
  }
}

/**
 * 08:00 JST に同期を実行するスケジューラを開始する関数である．
 * 最初の実行は次回の 08:00 JST に，その後は 24 時間ごとに繰り返す．
 */
export function startScheduler() {
  const msUntilNext = msUntilNext0800JST();
  const hoursUntilNext = (msUntilNext / (1000 * 60 * 60)).toFixed(2);
  console.log(
    `⏰ [Scheduler] Next sync scheduled in ${hoursUntilNext} hours (08:00 JST).`,
  );

  // 次回の 08:00 に最初の同期を実行する
  setTimeout(() => {
    // 最初の実行
    void runAllProvidersSync();

    // 以降は 24 時間ごとに繰り返す
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setInterval(() => {
      void runAllProvidersSync();
    }, TWENTY_FOUR_HOURS);
  }, msUntilNext);
}
