"use server";

import type { AssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * ダッシュボードに表示する主要な指標 (KPI) を取得する関数である．
 * 総資産，純資産，前日比，資産タイプ別の内訳を計算する．
 */
export async function getDashboardKPI() {
  console.log("📊 Calculating dashboard KPIs...");
  const subAccounts = await prisma.subAccount.findMany({
    select: {
      id: true,
      balance: true,
      assetType: true,
    },
  });

  const totalAssets = subAccounts
    .filter(sa => sa.balance > 0)
    .reduce((sum, sa) => sum + sa.balance, 0);

  const totalLiabilities = subAccounts
    .filter(sa => sa.balance < 0)
    .reduce((sum, sa) => sum + sa.balance, 0);

  const netWorth = totalAssets + totalLiabilities;

  const byAssetType: Record<string, number> = {};
  for (const sa of subAccounts) {
    byAssetType[sa.assetType] = (byAssetType[sa.assetType] ?? 0) + sa.balance;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const yesterdayHistories = await prisma.balanceHistory.findMany({
    where: {
      date: {
        gte: yesterday,
        lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    select: {
      balance: true,
      subAccount: {
        select: {
          assetType: true,
        },
      },
    },
  });

  const yesterdayTotal = yesterdayHistories.reduce(
    (sum, h) => sum + h.balance,
    0,
  );
  const dailyChange = netWorth - yesterdayTotal;

  const yesterdayByType: Record<string, number> = {};
  for (const h of yesterdayHistories) {
    yesterdayByType[h.subAccount.assetType] =
      (yesterdayByType[h.subAccount.assetType] ?? 0) + h.balance;
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    dailyChange,
    byAssetType: byAssetType as Record<AssetType, number>,
    yesterdayByType: yesterdayByType as Record<AssetType, number>,
  };
}

/**
 * 指定された日数分の資産推移データを取得する関数である．
 * 日ごとの資産タイプ別合計金額を計算し，グラフ表示用の形式で返す．
 */
export async function getAssetHistory(days?: number) {
  console.log(`📈 Fetching asset history...`);
  const where: import("@prisma/client").Prisma.BalanceHistoryWhereInput = {};

  if (days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    where.date = { gte: since };
  }

  const histories = await prisma.balanceHistory.findMany({
    where,
    include: {
      subAccount: {
        select: {
          assetType: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const grouped: Record<string, Record<string, number>> = {};
  for (const h of histories) {
    const dateKey = h.date.toISOString().split("T")[0];
    if (!grouped[dateKey]) {
      grouped[dateKey] = { CASH: 0, INVESTMENT: 0, CRYPTO: 0, POINT: 0 };
    }
    grouped[dateKey][h.subAccount.assetType] += h.balance;
  }

  return Object.entries(grouped)
    .map(([date, values]) => ({
      date,
      ...values,
      total:
        (values.CASH ?? 0) +
        (values.INVESTMENT ?? 0) +
        (values.CRYPTO ?? 0) +
        (values.POINT ?? 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date)) as Array<{
    date: string;
    total: number;
    CASH: number;
    INVESTMENT: number;
    CRYPTO: number;
    POINT: number;
  }>;
}

/**
 * 有効期限が 1 ヶ月以内に迫っているポイント情報を取得する関数である．
 */
export async function getExpiringPoints() {
  console.log("⏰ Checking for expiring points...");
  const oneMonthLater = new Date();
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  return prisma.pointDetail.findMany({
    where: {
      expirationDate: {
        lte: oneMonthLater,
        gt: new Date(),
      },
    },
    include: {
      subAccount: {
        include: {
          mainAccount: true,
        },
      },
    },
    orderBy: {
      expirationDate: "asc",
    },
  });
}
