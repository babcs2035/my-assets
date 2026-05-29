"use server";

import type { AssetType } from "@prisma/client";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { nowJST, todayJST, yesterdayJST } from "@/lib/utils";

const toUtcDateOnly = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

// ── Internal implementations ──

/**
 * 資産・負債の詳細データを取得する。
 */
async function getAssetBreakdownInternal() {
  const subAccounts = await prisma.subAccount.findMany({
    where: { isHidden: false },
    include: {
      mainAccount: { select: { label: true } },
      holdings: {
        include: {
          subAccount: {
            select: {
              currentName: true,
              mainAccount: { select: { label: true } },
            },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const assets: Array<{
    name: string;
    account: string;
    mainAccount: string;
    type: AssetType;
    amount: number;
    holdings?: Array<{
      name: string;
      quantity: number;
      avgCostBasis: number;
      unitPrice: number;
      valuation: number;
      gainLoss: number;
      gainLossRate: number;
      dayBeforeRatio: number | null;
    }>;
  }> = [];
  const liabilities: Array<{
    name: string;
    account: string;
    mainAccount: string;
    amount: number;
  }> = [];

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const sa of subAccounts) {
    if (sa.assetType === "LIABILITY") {
      liabilities.push({
        name: sa.currentName,
        account: sa.mainAccount.label,
        mainAccount: sa.mainAccount.label,
        amount: sa.balance,
      });
      totalLiabilities += sa.balance;
    } else {
      assets.push({
        name: sa.currentName,
        account: sa.mainAccount.label,
        mainAccount: sa.mainAccount.label,
        type: sa.assetType,
        amount: sa.balance,
        holdings:
          sa.holdings.length > 0
            ? sa.holdings.map(h => ({
                name: h.name,
                quantity: h.quantity,
                avgCostBasis: h.avgCostBasis,
                unitPrice: h.unitPrice,
                valuation: h.valuation,
                gainLoss: h.gainLoss,
                gainLossRate: h.gainLossRate,
                dayBeforeRatio: h.dayBeforeRatio,
              }))
            : undefined,
      });
      totalAssets += sa.balance;
    }
  }

  return {
    assets: assets.sort((a, b) => b.amount - a.amount),
    liabilities: liabilities.sort((a, b) => b.amount - a.amount),
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets + totalLiabilities,
  };
}

/**
 * 資産タイプ別の前日比データを取得する。
 */
async function getAssetTypeComparisonInternal() {
  const subAccounts = await prisma.subAccount.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      assetType: true,
      balance: true,
    },
  });

  const today = todayJST();
  const yesterday = yesterdayJST();

  const yesterdayHistories = await prisma.balanceHistory.findMany({
    where: {
      subAccount: { isHidden: false },
      date: { gte: yesterday, lt: today },
    },
    select: {
      balance: true,
      subAccount: { select: { assetType: true } },
    },
  });

  const todayByType: Record<string, number> = {};
  for (const sa of subAccounts) {
    todayByType[sa.assetType] = (todayByType[sa.assetType] ?? 0) + sa.balance;
  }

  const yesterdayByType: Record<string, number> = {};
  for (const h of yesterdayHistories) {
    yesterdayByType[h.subAccount.assetType] =
      (yesterdayByType[h.subAccount.assetType] ?? 0) + h.balance;
  }

  // 週間・月間・年間の比較も計算
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const weekHistories = await prisma.balanceHistory.findMany({
    where: {
      subAccount: { isHidden: false },
      date: { gte: oneWeekAgo, lt: today },
    },
    select: {
      balance: true,
      subAccount: { select: { assetType: true } },
    },
  });

  const monthHistories = await prisma.balanceHistory.findMany({
    where: {
      subAccount: { isHidden: false },
      date: { gte: oneMonthAgo, lt: today },
    },
    select: {
      balance: true,
      subAccount: { select: { assetType: true } },
    },
  });

  const yearHistories = await prisma.balanceHistory.findMany({
    where: {
      subAccount: { isHidden: false },
      date: { gte: oneYearAgo, lt: today },
    },
    select: {
      balance: true,
      subAccount: { select: { assetType: true } },
    },
  });

  const compareByType = (histories: typeof yesterdayHistories) => {
    const result: Record<string, number> = {};
    for (const h of histories) {
      result[h.subAccount.assetType] =
        (result[h.subAccount.assetType] ?? 0) + h.balance;
    }
    return result;
  };

  const weekByType = compareByType(weekHistories);
  const monthByType = compareByType(monthHistories);
  const yearByType = compareByType(yearHistories);

  const assetTypes: Array<{
    type: AssetType;
    today: number;
    yesterday: number;
    weekAgo: number;
    monthAgo: number;
    yearAgo: number;
  }> = [];

  for (const sa of subAccounts) {
    if (sa.assetType === "LIABILITY") continue;
    const type = sa.assetType;
    const todayVal = todayByType[type] ?? 0;
    const yesterdayVal = yesterdayByType[type] ?? 0;
    const weekVal = weekByType[type] ?? 0;
    const monthVal = monthByType[type] ?? 0;
    const yearVal = yearByType[type] ?? 0;

    assetTypes.push({
      type,
      today: todayVal,
      yesterday: yesterdayVal,
      weekAgo: weekVal,
      monthAgo: monthVal,
      yearAgo: yearVal,
    });
  }

  return assetTypes;
}

/**
 * 今月の収支（収入・支出・収支）を取得する。
 */
async function getCurrentMonthIncomeExpenseInternal() {
  const now = nowJST();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const start = toUtcDateOnly(year, month, 1);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = toUtcDateOnly(nextYear, nextMonth, 1);

  const [incomeResult, expenseResult] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        date: { gte: start, lt: end },
        isTransfer: false,
        subAccount: { isHidden: false },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        date: { gte: start, lt: end },
        isTransfer: false,
        subAccount: { isHidden: false },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    }),
  ]);

  const totalIncome = incomeResult._sum.amount ?? 0;
  const totalExpense = Math.abs(expenseResult._sum.amount ?? 0);

  // 前月の収支も取得
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevStart = toUtcDateOnly(prevYear, prevMonth, 1);
  const prevNextYear = prevMonth === 12 ? prevYear + 1 : prevYear;
  const prevNextMonth = prevMonth === 12 ? 1 : prevMonth + 1;
  const prevEnd = toUtcDateOnly(prevNextYear, prevNextMonth, 1);

  const [prevIncomeResult, prevExpenseResult] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        date: { gte: prevStart, lt: prevEnd },
        isTransfer: false,
        subAccount: { isHidden: false },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        date: { gte: prevStart, lt: prevEnd },
        isTransfer: false,
        subAccount: { isHidden: false },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    current: {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense,
    },
    previous: {
      income: prevIncomeResult._sum.amount ?? 0,
      expense: Math.abs(prevExpenseResult._sum.amount ?? 0),
      balance:
        (prevIncomeResult._sum.amount ?? 0) -
        Math.abs(prevExpenseResult._sum.amount ?? 0),
    },
  };
}

// ── Cached exports (TTL: 5分) ──

/**
 * 資産・負債の詳細内訳を取得する（TTL: 5分）。
 */
export const getAssetBreakdown = async () => {
  logger.info("Fetching asset breakdown...");
  return getAssetBreakdownInternal();
};

/**
 * 資産タイプ別の前日・週間・月間・年間比較を取得する（TTL: 5分）。
 */
export const getAssetTypeComparison = async () => {
  logger.info("Fetching asset type comparison...");
  return getAssetTypeComparisonInternal();
};

/**
 * 今月の収支を取得する（TTL: 5分）。
 */
export const getCurrentMonthIncomeExpense = async () => {
  logger.info("Fetching current month income/expense...");
  return getCurrentMonthIncomeExpenseInternal();
};
