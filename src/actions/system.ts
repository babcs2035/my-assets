"use server";

import { prisma } from "@/lib/prisma";

/**
 * 最後に資産データが同期された日時を取得する関数である．
 * BalanceHistory テーブルの最新の日付を取得して返す．
 */
export async function getLastSyncTime() {
  console.log("🕒 Fetching last sync time...");
  const lastHistory = await prisma.balanceHistory.findFirst({
    orderBy: { date: "desc" },
  });

  return lastHistory?.date ?? null;
}
