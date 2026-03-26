"use server";

import { prisma } from "@/lib/prisma";

/**
 * 最後に同期が実行された Provider の情報を取得する関数である．
 * 各 Provider の lastSyncAt / lastSyncSuccess を参照し，最も新しい同期情報を返す．
 */
export async function getLastSyncInfo() {
  console.log("🕒 Fetching last sync info from providers...");
  const provider = await prisma.provider.findFirst({
    where: { lastSyncAt: { not: null } },
    orderBy: { lastSyncAt: "desc" },
    select: {
      lastSyncAt: true,
      lastSyncSuccess: true,
      name: true,
    },
  });

  if (!provider || !provider.lastSyncAt) {
    return null;
  }

  return {
    date: provider.lastSyncAt,
    success: provider.lastSyncSuccess ?? false,
    providerName: provider.name,
  };
}

/**
 * 後方互換性のために残す関数である．
 */
export async function getLastSyncTime() {
  const info = await getLastSyncInfo();
  return info?.date ?? null;
}
