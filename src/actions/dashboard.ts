"use server";

import type { AssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatJSTDate, nowJST, todayJST, yesterdayJST } from "@/lib/utils";

/**
 * ダッシュボードに表示する主要な指標 (KPI) を取得する関数である．
 * 総資産，純資産，前日比，資産タイプ別の内訳を計算する．
 */
export async function getDashboardKPI() {
  console.log("📊 Calculating dashboard KPIs...");
  const subAccounts = await prisma.subAccount.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      balance: true,
      assetType: true,
    },
  });

  const totalAssets = subAccounts
    .filter(sa => sa.assetType !== "LIABILITY" && sa.balance > 0)
    .reduce((sum, sa) => sum + sa.balance, 0);

  const totalLiabilities = subAccounts
    .filter(sa => sa.assetType === "LIABILITY")
    .reduce((sum, sa) => sum + sa.balance, 0);

  const netWorth = totalAssets + totalLiabilities;

  const byAssetType: Record<string, number> = {};
  for (const sa of subAccounts) {
    byAssetType[sa.assetType] = (byAssetType[sa.assetType] ?? 0) + sa.balance;
  }

  const yesterday = yesterdayJST();
  const today = todayJST();

  const yesterdayHistories = await prisma.balanceHistory.findMany({
    where: {
      subAccount: { isHidden: false },
      date: {
        gte: yesterday,
        lt: today,
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
 * balanceHistory テーブルから直接残高履歴を取得する（MoneyForward の履歴ページから取得済み）．
 */
export async function getAssetHistory(days?: number) {
  console.log(`📈 Fetching asset history from balanceHistory...`);

  // 対象期間の計算（JST）
  const today = todayJST();
  let since = new Date(today);
  if (days) {
    since.setDate(since.getDate() - days);
  } else {
    // ALL 用: 最古の履歴日まで遡る（データがなければ1年分）
    const oldestHistory = await prisma.balanceHistory.findFirst({
      select: { date: true },
      orderBy: { date: "asc" },
    });

    if (oldestHistory?.date) {
      since = new Date(oldestHistory.date);
      since.setHours(0, 0, 0, 0);
    } else {
      since.setFullYear(since.getFullYear() - 1);
    }
  }

  // 全 SubAccount の資産タイプを取得
  const subAccounts = await prisma.subAccount.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      assetType: true,
      balance: true,
    },
  });

  const assetTypeMap = new Map<string, AssetType>();
  for (const sa of subAccounts) {
    assetTypeMap.set(sa.id, sa.assetType);
  }

  // 対象期間の balanceHistory を取得
  const histories = await prisma.balanceHistory.findMany({
    where: {
      subAccount: { isHidden: false },
      date: { gte: since },
    },
    select: {
      subAccountId: true,
      date: true,
      balance: true,
    },
    orderBy: { date: "asc" },
  });

  // 日付ごと・資産タイプ別に集計
  const grouped: Record<string, Record<string, number>> = {};

  for (const h of histories) {
    const dateKey = formatJSTDate(h.date);
    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        CASH: 0,
        INVESTMENT: 0,
        CRYPTO: 0,
        POINT: 0,
        LIABILITY: 0,
      };
    }
    const assetType = assetTypeMap.get(h.subAccountId) ?? "CASH";
    grouped[dateKey][assetType] += h.balance;
  }

  // 最新日のスナップショットを必ず含める（履歴欠損時の0表示を防ぐ）
  const todayKey = formatJSTDate(today);
  grouped[todayKey] = {
    CASH: 0,
    INVESTMENT: 0,
    CRYPTO: 0,
    POINT: 0,
    LIABILITY: 0,
  };
  for (const sa of subAccounts) {
    grouped[todayKey][sa.assetType] += sa.balance;
  }

  return Object.entries(grouped)
    .map(([date, values]) => ({
      date,
      ...values,
      total:
        (values.CASH ?? 0) +
        (values.INVESTMENT ?? 0) +
        (values.CRYPTO ?? 0) +
        (values.POINT ?? 0) +
        (values.LIABILITY ?? 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date)) as Array<{
    date: string;
    total: number;
    CASH: number;
    INVESTMENT: number;
    CRYPTO: number;
    POINT: number;
    LIABILITY: number;
  }>;
}

/**
 * 有効期限が 1 ヶ月以内に迫っているポイント情報を取得する関数である．
 */
export async function getExpiringPoints() {
  console.log("⏰ Checking for expiring points...");
  const now = nowJST();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  return prisma.pointDetail.findMany({
    where: {
      subAccount: { isHidden: false },
      expirationDate: {
        lte: oneMonthLater,
        gt: now,
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
