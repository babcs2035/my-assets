"use server";

import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const toUtcDateOnly = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

// ── Internal (uncached) implementations ──

/**
 * 指定された年月の収入・支出・収支をカテゴリ別を取得する。
 */
async function getMonthlyIncomeExpenseInternal(
  year: number,
  month: number,
  mainAccountId?: string,
  subAccountId?: string,
) {
  const start = toUtcDateOnly(year, month, 1);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = toUtcDateOnly(nextYear, nextMonth, 1);

  const subAccountWhere: Record<string, unknown> = { isHidden: false };
  if (mainAccountId) subAccountWhere.mainAccountId = mainAccountId;
  if (subAccountId) subAccountWhere.id = subAccountId;

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      isTransfer: false,
      subAccount: subAccountWhere,
    },
    include: {
      subCategory: {
        include: { mainCategory: true },
      },
    },
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const incomeByCategory: Record<string, { name: string; amount: number }> = {};
  const expenseByCategory: Record<string, { name: string; amount: number }> =
    {};

  for (const tx of transactions) {
    const amount = tx.amount;
    if (amount > 0) {
      totalIncome += amount;
      const key = tx.subCategory
        ? `${tx.subCategory.mainCategory.name}/${tx.subCategory.name}`
        : "未分類";
      if (!incomeByCategory[key]) {
        incomeByCategory[key] = {
          name: key,
          amount: 0,
        };
      }
      incomeByCategory[key].amount += amount;
    } else {
      totalExpense += Math.abs(amount);
      const key = tx.subCategory
        ? `${tx.subCategory.mainCategory.name}/${tx.subCategory.name}`
        : "未分類";
      if (!expenseByCategory[key]) {
        expenseByCategory[key] = {
          name: key,
          amount: 0,
        };
      }
      expenseByCategory[key].amount += Math.abs(amount);
    }
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    incomeByCategory: Object.values(incomeByCategory).sort(
      (a, b) => b.amount - a.amount,
    ),
    expenseByCategory: Object.values(expenseByCategory).sort(
      (a, b) => b.amount - a.amount,
    ),
  };
}

/**
 * 累計収入・支出・収支を年月ごとに取得する。
 */
async function getIncomeExpenseTrendInternal(
  year?: number,
  mainAccountId?: string,
  subAccountId?: string,
) {
  const subAccountWhere: Record<string, unknown> = { isHidden: false };
  if (mainAccountId) subAccountWhere.mainAccountId = mainAccountId;
  if (subAccountId) subAccountWhere.id = subAccountId;

  const where: Record<string, unknown> = {
    date: { gte: new Date("2024-01-01") },
    isTransfer: false,
    subAccount: subAccountWhere,
  };

  if (year) {
    const start = toUtcDateOnly(year, 1, 1);
    const nextYear = year + 1;
    const end = toUtcDateOnly(nextYear, 1, 1);
    where.date = { gte: start, lt: end };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    select: { date: true, amount: true },
    orderBy: { date: "asc" },
  });

  const monthlyMap = new Map<
    string,
    { income: number; expense: number; balance: number }
  >();
  let cumulativeIncome = 0;
  let cumulativeExpense = 0;
  let cumulativeBalance = 0;

  for (const tx of transactions) {
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { income: 0, expense: 0, balance: 0 });
    }
    // biome-ignore lint/style/noNonNullAssertion: key guaranteed to exist after set above
    const m = monthlyMap.get(key)!;
    if (tx.amount > 0) {
      m.income += tx.amount;
      cumulativeIncome += tx.amount;
    } else {
      m.expense += Math.abs(tx.amount);
      cumulativeExpense += Math.abs(tx.amount);
    }
    m.balance = m.income - m.expense;
    cumulativeBalance = cumulativeIncome - cumulativeExpense;
  }

  const trend = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({
      period: key,
      ...values,
      cumulativeIncome,
      cumulativeExpense,
      cumulativeBalance,
    }));

  return trend;
}

/**
 * 年ごとの累計収入・支出・収支を取得する。
 */
async function getAnnualIncomeExpenseInternal(
  mainAccountId?: string,
  subAccountId?: string,
) {
  const subAccountWhere: Record<string, unknown> = { isHidden: false };
  if (mainAccountId) subAccountWhere.mainAccountId = mainAccountId;
  if (subAccountId) subAccountWhere.id = subAccountId;

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: new Date("2024-01-01") },
      isTransfer: false,
      subAccount: subAccountWhere,
    },
    select: { date: true, amount: true },
  });

  const annualMap = new Map<number, { income: number; expense: number }>();

  for (const tx of transactions) {
    const year = new Date(tx.date).getFullYear();
    if (!annualMap.has(year)) {
      annualMap.set(year, { income: 0, expense: 0 });
    }
    // biome-ignore lint/style/noNonNullAssertion: key guaranteed to exist after set above
    const a = annualMap.get(year)!;
    if (tx.amount > 0) a.income += tx.amount;
    else a.expense += Math.abs(tx.amount);
  }

  return Array.from(annualMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, values]) => ({
      year,
      ...values,
      balance: values.income - values.expense,
    }));
}

// ── Cached exports ──

/**
 * 指定年月の収支データを取得する（TTL: 5分）。
 */
export const getMonthlyIncomeExpense = async (
  year: number,
  month: number,
  mainAccountId?: string,
  subAccountId?: string,
) => {
  logger.info(`Fetching monthly income/expense for ${year}-${month}...`);
  return getMonthlyIncomeExpenseInternal(
    year,
    month,
    mainAccountId,
    subAccountId,
  );
};

/**
 * 収支推移データを取得する（TTL: 5分）。
 */
export const getIncomeExpenseTrend = async (
  year?: number,
  mainAccountId?: string,
  subAccountId?: string,
) => {
  logger.info("Fetching income/expense trend...");
  return getIncomeExpenseTrendInternal(year, mainAccountId, subAccountId);
};

/**
 * 年別収支データを取得する（TTL: 5分）。
 */
export const getAnnualIncomeExpense = async (
  mainAccountId?: string,
  subAccountId?: string,
) => {
  logger.info("Fetching annual income/expense...");
  return getAnnualIncomeExpenseInternal(mainAccountId, subAccountId);
};
