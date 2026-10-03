"use server";

import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  revalidateSettingsAndDashboardPages,
  revalidateSettingsPage,
} from "@/lib/revalidate";
import {
  acquireSyncLock,
  releaseSyncLock,
  syncLockStaleBefore,
} from "@/lib/sync-lock";
import {
  type ProviderCreateInput,
  providerCreateSchema,
} from "@/lib/validations";
import { abortMfScraper, runMfScraper } from "@/scraper/mf-scraper";

// このプロセスで動いている手動同期を管理するマップ
// key: providerId, value: 中止用の AbortController と，その同期が取ったロックの印
const activeSyncControllers = new Map<
  string,
  { controller: AbortController; lockedAt: Date }
>();

/**
 * すべてのプロバイダー情報を取得する関数である．
 * MoneyForward タイプを優先して表示し，有効なプロバイダーを先に表示する．
 */
export async function getProviders() {
  logger.info("📂 Fetching providers from database...");
  const providers = await prisma.provider.findMany({
    include: {
      _count: {
        select: { mainAccounts: true },
      },
    },
  });

  // MoneyForward タイプを先頭に，次にカスタムタイプを表示する．
  // 同一タイプ内では有効なものを優先する．
  return providers.sort((a, b) => {
    // タイプ順: mf → custom → その他
    const typeOrder = (t: string) => (t === "mf" ? 0 : t === "custom" ? 1 : 2);
    const typeDiff = typeOrder(a.type) - typeOrder(b.type);
    if (typeDiff !== 0) return typeDiff;

    // 同一タイプ内では有効なものを優先する
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

    return a.name.localeCompare(b.name);
  });
}

/**
 * 新しいプロバイダーを作成する関数である．
 */
export async function createProvider(input: ProviderCreateInput) {
  const data = providerCreateSchema.parse(input);
  logger.info(`➕ Creating new provider: ${data.name}`);
  await prisma.provider.create({
    data: {
      name: data.name,
      type: data.type,
      scraperScript: data.scraperScript || null,
      isActive: true,
    },
  });
  revalidateSettingsPage();
}

/**
 * 指定されたプロバイダーを削除する関数である．
 */
export async function deleteProvider(id: string) {
  logger.info(`🗑️ Deleting provider: ${id}`);
  await prisma.$transaction(async tx => {
    const mainAccounts = await tx.mainAccount.findMany({
      where: { providerId: id },
      select: { id: true },
    });
    const mainAccountIds = mainAccounts.map(ma => ma.id);

    if (mainAccountIds.length > 0) {
      const subAccounts = await tx.subAccount.findMany({
        where: { mainAccountId: { in: mainAccountIds } },
        select: { id: true },
      });
      const subAccountIds = subAccounts.map(sa => sa.id);

      if (subAccountIds.length > 0) {
        await tx.balanceHistory.deleteMany({
          where: { subAccountId: { in: subAccountIds } },
        });
        await tx.transaction.deleteMany({
          where: { subAccountId: { in: subAccountIds } },
        });
        await tx.holding.deleteMany({
          where: { subAccountId: { in: subAccountIds } },
        });
        await tx.cryptoAsset.deleteMany({
          where: { subAccountId: { in: subAccountIds } },
        });
        await tx.pointDetail.deleteMany({
          where: { subAccountId: { in: subAccountIds } },
        });
        // TransferRule.targetSubAccount は Restrict なので，
        // 削除対象のサブ口座が転送ルールの対象である場合は先にルールを削除する
        await tx.transferRule.deleteMany({
          where: { targetSubAccountId: { in: subAccountIds } },
        });
        await tx.subAccount.deleteMany({
          where: { id: { in: subAccountIds } },
        });
      }

      await tx.mainAccount.deleteMany({
        where: { id: { in: mainAccountIds } },
      });
    }

    await tx.provider.delete({
      where: { id },
    });
  });
  revalidateSettingsPage();
}

/**
 * 指定されたプロバイダーの同期を始め，そのロックの印（lockedAt）を返す関数である．
 * 同期の終わりは待たない．runMfScraper は数分から数十分かかり，Server Action はクライアントで 1 件ずつ送られるので，
 * ここで待つと中止（abortSyncProvider）や画面の読み込みが同期の終わりまで送られない．
 * 画面は返した印を getManualSyncResult に渡して終わりを問い合わせる．
 * 同期結果（成功/失敗，日時）は Provider レコードに記録する．
 */
export async function syncProvider(id: string): Promise<Date> {
  logger.info(`🔄 Syncing provider: ${id}`);

  const provider = await prisma.provider.findUnique({
    where: { id },
  });

  if (!provider) {
    logger.error(`❌ Provider not found: ${id}`);
    throw new Error(`Provider not found: ${id}`);
  }
  // runMfScraper はプロバイダー名を 1Password のアイテム名として MF にログインする．
  // custom 型は `mise sync`（src/scripts/sync.ts）がスクリプトを実行して同期する
  if (provider.type !== "mf") {
    logger.warn(`⚠️ Provider type ${provider.type} cannot be synced here.`);
    throw new Error(
      "この種類のプロバイダーは画面から同期できません．`mise sync` を使ってください．",
    );
  }

  // このプロセスで前の手動同期が動いていれば中止し，そのロックを奪う．
  // 中止された側も自分の印でロックを解除しようとするが，印が変わっているので何も書かない
  const previous = activeSyncControllers.get(id);
  if (previous) {
    logger.info(`⚠️ Previous sync for ${id} is still running. Aborting it.`);
    previous.controller.abort();
    activeSyncControllers.delete(id);
  }

  // 自動同期や `mise sync` の同期は中止できないので，それらがロックを持っていればエラーにする
  const lockedAt = await acquireSyncLock(id, { force: previous !== undefined });
  if (!lockedAt) {
    logger.warn(`⚠️ Another sync for ${id} is already running.`);
    throw new Error("別の同期が実行中です．");
  }

  const abortController = new AbortController();
  activeSyncControllers.set(id, { controller: abortController, lockedAt });

  // 誰も await しないので，ロックの解除などで投げられた例外はここで記録して握りつぶす
  void runManualSync(id, provider.name, abortController, lockedAt).catch(
    error => {
      logger.error(
        { err: error },
        `❌ Failed to finish manual sync for provider: ${provider.name}`,
      );
    },
  );

  return lockedAt;
}

/**
 * syncProvider が始めた同期を最後まで実行し，結果をロックの解除で記録する関数である．
 * request の外で終わるので revalidatePath は呼べない．再検証は getManualSyncResult が行う
 */
async function runManualSync(
  id: string,
  providerName: string,
  abortController: AbortController,
  lockedAt: Date,
) {
  try {
    logger.info(`🚀 Executing scraper for provider: ${providerName}`);
    await runMfScraper(providerName, abortController.signal, {
      mode: "manual",
    });
    logger.info(`✅ Sync completed for provider: ${providerName}`);
    await releaseSyncLock(id, lockedAt, true);
  } catch (error) {
    if (abortController.signal.aborted) {
      logger.info(`🛑 Sync aborted for provider: ${providerName}`);
    } else {
      logger.error(
        { err: error },
        `❌ Sync failed for provider: ${providerName}`,
      );
    }
    // 中止では abortSyncProvider が先にロックを外しているので，ここでは何も書かれない
    await releaseSyncLock(id, lockedAt, false);
  } finally {
    // 後から始まった同期が登録した controller を消さないよう，自分のものだけを消す
    if (activeSyncControllers.get(id)?.controller === abortController) {
      activeSyncControllers.delete(id);
    }
  }
}

export type ManualSyncResult = "running" | "success" | "failed";

/**
 * syncProvider が始めた同期（印が lockedAt のもの）が終わったかを返す関数である．
 * 終わっていれば設定画面とダッシュボードを再検証する．同期そのものは request の外で終わり再検証できないので，
 * 終わりを知った画面からのこの呼び出しで代わりに行う．
 * ロックが奪われた・中止で外された・プロバイダーが消されたときも，その同期は終わったとして "failed" を返す
 */
export async function getManualSyncResult(
  id: string,
  lockedAt: Date,
): Promise<ManualSyncResult> {
  logger.debug(`🕒 Checking manual sync result for provider: ${id}`);
  const provider = await prisma.provider.findUnique({
    where: { id },
    select: { lastSyncAt: true, lastSyncSuccess: true },
  });

  // 同期の途中でプロセスが再起動すると，ロックは期限切れまで残る．期限切れなら終わったとみなし，問い合わせを止めさせる
  const isRunning =
    provider?.lastSyncSuccess === null &&
    provider.lastSyncAt?.getTime() === lockedAt.getTime() &&
    lockedAt >= syncLockStaleBefore();
  if (isRunning) {
    return "running";
  }

  revalidateSettingsAndDashboardPages();
  return provider?.lastSyncSuccess ? "success" : "failed";
}

/**
 * 指定されたプロバイダーの同期を強制終了する関数である．
 */
export async function abortSyncProvider(id: string) {
  logger.info(`🛑 Aborting sync for provider: ${id}`);

  const active = activeSyncControllers.get(id);
  if (active) {
    active.controller.abort();
    activeSyncControllers.delete(id);
  }

  // このプロセスで動いている同期（手動と自動）のブラウザを閉じる．
  // 自動同期は例外を受けて，自分の印でロックを外し失敗を記録する
  await abortMfScraper(id);

  // 外すのは，このプロセスの手動同期が取ったロックだけにする．
  // `mise sync` の同期は別のプロセスなので止められず，ロックだけを外すと次の同期と同時に書き込んでしまう
  if (active) {
    await releaseSyncLock(id, active.lockedAt, false);
  }

  revalidateSettingsAndDashboardPages();

  return { success: true };
}
