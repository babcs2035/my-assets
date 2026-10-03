"use server";

import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { syncLockStaleBefore } from "@/lib/sync-lock";

/**
 * 最後に同期が実行された Provider の情報を取得する関数である．
 * 有効な Provider の lastSyncAt / lastSyncSuccess を参照し，最も新しい同期情報を返す．
 * 最新の結果が失敗の Provider があれば，そちらを優先して返す．
 * 期限切れのロック（同期の途中でプロセスが落ちて残ったもの）は同期中とせず，失敗として返す．
 */
export async function getLastSyncInfo() {
  // sync-status.tsx が開いているタブごとに 60 秒おきに呼ぶため，info だとログが増え続ける
  logger.debug("🕒 Fetching last sync info from providers...");
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

  const providers = await prisma.provider.findMany({
    where: { lastSyncAt: { not: null }, isActive: true },
    orderBy: { lastSyncAt: "desc" },
    select: {
      lastSyncAt: true,
      lastSyncSuccess: true,
      name: true,
    },
  });

  // 最新の 1 件だけを見ると，A が失敗したあとに B が成功したとき A の失敗が見えなくなる．
  // 最新の結果が失敗のプロバイダーが 1 つでもあれば，そちらを返す
  const provider = providers.find(p => !p.lastSyncSuccess) ?? providers.at(0);

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
