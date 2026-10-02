"use server";

import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { syncLockStaleBefore } from "@/lib/sync-lock";

/**
 * 最後に同期が実行された Provider の情報を取得する関数である．
 * 各 Provider の lastSyncAt / lastSyncSuccess を参照し，最も新しい同期情報を返す．
 * 期限切れのロック（同期の途中でプロセスが落ちて残ったもの）は同期中とせず，失敗として返す．
 */
export async function getLastSyncInfo() {
  logger.info("🕒 Fetching last sync info from providers...");
  const syncingProvider = await prisma.provider.findFirst({
    where: {
      lastSyncAt: { gte: syncLockStaleBefore() },
      lastSyncSuccess: null,
      isActive: true,
    },
    orderBy: { lastSyncAt: "desc" },
    select: {
      lastSyncAt: true,
      lastSyncSuccess: true,
      name: true,
    },
  });

  if (syncingProvider?.lastSyncAt) {
    return {
      date: syncingProvider.lastSyncAt,
      success: null,
      status: "syncing" as const,
      providerName: syncingProvider.name,
    };
  }

  const provider = await prisma.provider.findFirst({
    where: { lastSyncAt: { not: null } },
    orderBy: { lastSyncAt: "desc" },
    select: {
      lastSyncAt: true,
      lastSyncSuccess: true,
      name: true,
    },
  });

  if (!provider?.lastSyncAt) {
    return null;
  }

  return {
    date: provider.lastSyncAt,
    success: provider.lastSyncSuccess ?? false,
    status: provider.lastSyncSuccess
      ? ("success" as const)
      : ("error" as const),
    providerName: provider.name,
  };
}
