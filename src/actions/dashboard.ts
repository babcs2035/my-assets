"use server";

import type { AssetType } from "@prisma/client";
import { unstable_cache } from "next/cache";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { formatJSTDate, nowJST, todayJST, yesterdayJST } from "@/lib/utils";

// ── Internal (uncached) implementations ──

async function getDashboardKPIInternal() {
  logger.info("Calculating dashboard KPIs...");
  const subAccounts = await prisma.subAccount.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      balance: true,
      assetType: true,
    },
  });

  // 負債以外の残高をすべて合計する（マイナス残高を含む）．
  // 資産ページ (getAssetBreakdown) と純資産の定義を一致させるため．
  const totalAssets = subAccounts
    .filter(sa => sa.assetType !== "LIABILITY")
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
      subAccountId: true,
      subAccount: {
        select: {
          assetType: true,
        },
      },
    },
  });

  // 全表示口座に前日の履歴が存在する場合のみ前日比を計算する．
  // 履歴が不完全なまま 0 と比較すると「前日比 +¥8,000,000」のような
  // 誤った値が表示されるため，不完全時は null を返す（UI は「—」表示）．
  const visibleIds = new Set(subAccounts.map(sa => sa.id));
  const yesterdayIds = new Set(yesterdayHistories.map(h => h.subAccountId));
  const hasCompleteYesterdayHistory =
    visibleIds.size > 0 && [...visibleIds].every(id => yesterdayIds.has(id));

  const yesterdayTotal = yesterdayHistories.reduce(
    (sum, h) => sum + h.balance,
    0,
  );
  const dailyChange = hasCompleteYesterdayHistory
    ? netWorth - yesterdayTotal
    : null;

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
    yesterdayByType: hasCompleteYesterdayHistory
      ? (yesterdayByType as Record<AssetType, number>)
      : null,
  };
}

async function getAssetHistoryInternal(days?: number) {
  logger.info("Fetching asset history from balanceHistory...");

  // 保存された日付は JST 日付の UTC 0 時であるため，
  // 日付の計算はすべて UTC getter/setter で行う（TZ 非依存）
  const today = todayJST();
  let since = new Date(today);
  if (days) {
    since.setUTCDate(since.getUTCDate() - days);
  } else {
    const oldestHistory = await prisma.balanceHistory.findFirst({
      select: { date: true },
      orderBy: { date: "asc" },
    });

    if (oldestHistory?.date) {
      since = new Date(oldestHistory.date);
      since.setUTCHours(0, 0, 0, 0);
    } else {
      since.setUTCFullYear(since.getUTCFullYear() - 1);
    }
  }

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

async function getExpiringPointsInternal() {
  logger.info("Checking for expiring points...");
  const now = nowJST();
  // 現在の JST 年月から「翌月 1 日」を組む（TZ 非依存）．
  // 保存日付は JST 暦日の UTC 0 時なので，Date.UTC（0 始まり月）で境界を組む．
  // 現在月が 12 月なら翌年の 1 月になる（Date.UTC の月オーバーフローに
  // 依存せず，意図を明示する）．
  const jst = formatJSTDate(now);
  const currentYear = Number(jst.slice(0, 4));
  const currentMonth = Number(jst.slice(5, 7)); // 1 始まり
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
  const oneMonthLater = new Date(Date.UTC(nextYear, nextMonth - 1, 1));

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

// ── Cached exports (TTL: 5分) ──

/**
 * ダッシュボードに表示する主要な指標 (KPI) を取得する関数である．
 * 総資産，純資産，前日比，資産タイプ別の内訳を計算する．
 */
export const getDashboardKPI = unstable_cache(
  getDashboardKPIInternal,
  ["dashboard-kpi"],
  { revalidate: 300, tags: ["dashboard"] },
);

/**
 * 指定された日数分の資産推移データを取得する関数である．
 * balanceHistory テーブルから直接残高履歴を取得する（MoneyForward の履歴ページから取得済み）．
 */
export const getAssetHistory = unstable_cache(
  getAssetHistoryInternal,
  ["asset-history"],
  { revalidate: 300, tags: ["asset-history"] },
);

/**
 * 有効期限が 1 ヶ月以内に迫っているポイント情報を取得する関数である．
 */
export const getExpiringPoints = unstable_cache(
  getExpiringPointsInternal,
  ["expiring-points"],
  { revalidate: 300, tags: ["expiring-points"] },
);
