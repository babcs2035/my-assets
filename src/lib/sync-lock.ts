/**
 * プロバイダーごとの同期が重ならないようにするロックである．
 * 画面からの手動同期，08:00 の自動同期，`mise sync`（アプリとは別のプロセス）の 3 つの経路が同じ Provider 行に書き込むので，
 * プロセス内の変数ではなく DB の条件付き更新でロックを取る．
 * `lastSyncSuccess = null` を「同期中」とし，そのときの `lastSyncAt` を，ロックを取った同期を見分ける印として使う．
 */
import logger from "./logger";
import { prisma } from "./prisma";

/**
 * ロックの有効期限である．
 * 自動同期は MoneyForward 側の更新を最大 60 分待ってから明細を取得するので，正常に動いている同期のロックを奪わないよう，それより十分長くする．
 * これより古いロックは，同期の途中でプロセスが落ちて残ったものとみなす
 */
export const SYNC_LOCK_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * この時刻より前に取られたロックを期限切れとみなす，境目の時刻を返す関数である．
 * 画面の「同期中」の表示も同じ境目を使い，ロックを取れる状態と表示が食い違わないようにする
 */
export function syncLockStaleBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - SYNC_LOCK_TTL_MS);
}

/**
 * ロックを取り，取れたら印（ロックを取った時刻）を返す関数である．
 * 他の同期が期限内のロックを持っていれば null を返す．
 * `force` を指定すると他の同期のロックを奪う（同じプロセスで動いていた前の同期を中止したときに使う）．
 * 印は `new Date()` である．列は TIMESTAMP(3) なので，同じ 1 秒の中で取ったロックもミリ秒で見分けられる
 */
export async function acquireSyncLock(
  providerId: string,
  options: { force?: boolean } = {},
): Promise<Date | null> {
  const lockedAt = new Date();
  // 判定と書き込みを 1 つの UPDATE で行う．同じ行への UPDATE が同時に来ても，
  // 後から来た方は先の書き込みを待ってから WHERE を評価し直すので，ロックを取れるのは 1 つだけである
  const { count } = await prisma.provider.updateMany({
    where: options.force
      ? { id: providerId }
      : {
          id: providerId,
          OR: [
            { lastSyncSuccess: { not: null } },
            { lastSyncAt: null },
            { lastSyncAt: { lt: syncLockStaleBefore(lockedAt) } },
          ],
        },
    data: { lastSyncAt: lockedAt, lastSyncSuccess: null },
  });
  return count === 1 ? lockedAt : null;
}

/**
 * 自分のロックを解除し，同期の結果を記録する関数である．
 * 印が一致しないときは，ロックが奪われたか中止で外されたので何も書かない（古い同期が新しい同期の状態を上書きしない）．
 * 解除できたかどうかを返す
 */
export async function releaseSyncLock(
  providerId: string,
  lockedAt: Date,
  success: boolean,
): Promise<boolean> {
  const { count } = await prisma.provider.updateMany({
    where: { id: providerId, lastSyncAt: lockedAt, lastSyncSuccess: null },
    data: { lastSyncAt: new Date(), lastSyncSuccess: success },
  });
  if (count === 0) {
    logger.warn(
      { providerId, lockedAt },
      "⚠️ Sync lock was taken over or cleared. Not recording the result.",
    );
  }
  return count === 1;
}

/**
 * 持ち主に関係なくロックを外し，同期を失敗として記録する関数である．画面からの中止で使う．
 * 別のプロセス（`mise sync`）で動いている同期はこれでは止まらないが，印が変わるので，その同期はあとから結果を書かない
 */
export async function forceReleaseSyncLock(providerId: string): Promise<void> {
  await prisma.provider.update({
    where: { id: providerId },
    data: { lastSyncAt: new Date(), lastSyncSuccess: false },
  });
}
