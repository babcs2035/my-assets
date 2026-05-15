"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { nowJST } from "@/lib/utils";
import {
  type ProviderCreateInput,
  providerCreateSchema,
} from "@/lib/validations";
import { abortMfScraper, runMfScraper } from "@/scraper/mf-scraper";

// アクティブな同期プロセスを管理するマップ
// key: providerId, value: AbortController
const activeSyncControllers = new Map<string, AbortController>();

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
  requireAuth();
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
  revalidatePath("/settings");
}

/**
 * 指定されたプロバイダーを削除する関数である．
 */
export async function deleteProvider(id: string) {
  requireAuth();
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
  revalidatePath("/settings");
}

/**
 * 指定されたプロバイダーの同期処理を実行する関数である．
 * 同期結果（成功/失敗，日時）を Provider レコードに記録する．
 */
export async function syncProvider(id: string) {
  requireAuth();
  logger.info(`🔄 Syncing provider: ${id}`);

  const provider = await prisma.provider.findUnique({
    where: { id },
  });

  if (!provider) {
    logger.error(`❌ Provider not found: ${id}`);
    throw new Error(`Provider not found: ${id}`);
  }

  // 既存の同期があれば中止
  if (activeSyncControllers.has(id)) {
    logger.info(`⚠️ Previous sync for ${id} is still running. Aborting it.`);
    activeSyncControllers.get(id)?.abort();
    activeSyncControllers.delete(id);
  }

  const abortController = new AbortController();
  activeSyncControllers.set(id, abortController);

  try {
    await prisma.provider.update({
      where: { id },
      data: {
        lastSyncAt: nowJST(),
        lastSyncSuccess: null,
      },
    });

    logger.info(`🚀 Executing scraper for provider: ${provider.name}`);
    await runMfScraper(provider.name, abortController.signal, {
      mode: "manual",
    });
    logger.info(`✅ Sync completed for provider: ${provider.name}`);

    // 同期成功を記録する．
    await prisma.provider.update({
      where: { id },
      data: {
        lastSyncAt: nowJST(),
        lastSyncSuccess: true,
      },
    });
  } catch (error) {
    // 中止された場合は特別な処理
    if (abortController.signal.aborted) {
      logger.info(`🛑 Sync aborted for provider: ${provider.name}`);
      await prisma.provider.update({
        where: { id },
        data: {
          lastSyncAt: nowJST(),
          lastSyncSuccess: false,
        },
      });
      throw new Error("Sync was aborted");
    }

    logger.error(
      { err: error },
      `❌ Sync failed for provider: ${provider.name}`,
    );

    // 同期失敗を記録する．
    await prisma.provider.update({
      where: { id },
      data: {
        lastSyncAt: nowJST(),
        lastSyncSuccess: false,
      },
    });

    throw error;
  } finally {
    activeSyncControllers.delete(id);
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * 指定されたプロバイダーの同期を強制終了する関数である．
 */
export async function abortSyncProvider(id: string) {
  requireAuth();
  logger.info(`🛑 Aborting sync for provider: ${id}`);

  const controller = activeSyncControllers.get(id);
  if (controller) {
    controller.abort();
    activeSyncControllers.delete(id);
  }

  // スクレイパー側でも中止処理を呼ぶ
  await abortMfScraper(id);

  // ステータスを失敗に更新
  await prisma.provider.update({
    where: { id },
    data: {
      lastSyncAt: nowJST(),
      lastSyncSuccess: false,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/");

  return { success: true };
}
