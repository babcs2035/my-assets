"use server";

import type { AssetType } from "@prisma/client";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { formatJSTDate, nowJST } from "@/lib/utils";

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
    id: string;
    name: string;
    account: string;
    mainAccount: string;
    type: AssetType;
    amount: number;
    holdings?: Array<{
      id: string;
      name: string;
      quantity: number;
      avgCostBasis: number;
      acquisitionCost: number;
      unitPrice: number;
      valuation: number;
      gainLoss: number;
      gainLossRate: number;
      dayBeforeRatio: number | null;
    }>;
  }> = [];
  const liabilities: Array<{
    id: string;
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
        id: sa.id,
        name: sa.currentName,
        account: sa.mainAccount.label,
        mainAccount: sa.mainAccount.label,
        amount: sa.balance,
      });
      totalLiabilities += sa.balance;
    } else {
      assets.push({
        id: sa.id,
        name: sa.currentName,
        account: sa.mainAccount.label,
        mainAccount: sa.mainAccount.label,
        type: sa.assetType,
        amount: sa.balance,
        holdings:
          sa.holdings.length > 0
            ? sa.holdings.map(h => ({
                id: h.id,
                name: h.name,
                quantity: h.quantity,
                avgCostBasis: h.avgCostBasis,
                acquisitionCost: h.valuation - h.gainLoss,
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
 * 今月の収支（収入・支出・収支）を取得する。
 */
async function getCurrentMonthIncomeExpenseInternal() {
  const now = nowJST();
  // 現在の JST 年月を取得する（TZ 非依存）
  const jst = formatJSTDate(now);
  const year = Number(jst.slice(0, 4));
  const month = Number(jst.slice(5, 7));

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

/**
 * 資産・負債の詳細内訳を取得する。
 */
export const getAssetBreakdown = async () => {
  logger.info("Fetching asset breakdown...");
  return getAssetBreakdownInternal();
};

/**
 * 今月の収支を取得する。
 */
export const getCurrentMonthIncomeExpense = async () => {
  logger.info("Fetching current month income/expense...");
  return getCurrentMonthIncomeExpenseInternal();
};
