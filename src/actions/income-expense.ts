"use server";

import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const toUtcDateOnly = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

/**
 * 入出金集計（推移・年別）の対象とする明細の開始日である．
 * バックフィル開始日 (BACKFILL_START_DATE: 2023-01-01) とは別に，
 * 集計対象を 2024 年以降に絞るための意図的なデータ起点である．
 */
const INCOME_EXPENSE_AGGREGATION_START_DATE = "2024-01-01";

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
    date: { gte: new Date(INCOME_EXPENSE_AGGREGATION_START_DATE) },
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

  for (const tx of transactions) {
    // 日付は JST 日付の UTC 0 時として保存されるため，
    // UTC getter で月キーを組む（ローカル getter では UTC より西の
    // サーバー TZ で月初の取引が前の月に帰属する）
    const d = new Date(tx.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { income: 0, expense: 0, balance: 0 });
    }
    // biome-ignore lint/style/noNonNullAssertion: key guaranteed to exist after set above
    const m = monthlyMap.get(key)!;
    if (tx.amount > 0) {
      m.income += tx.amount;
    } else {
      m.expense += Math.abs(tx.amount);
    }
    m.balance = m.income - m.expense;
  }

  // 月ごとに集計した収入・支出を時系列順に走査し，累計（累積収支）を算出する．
  // 元の実装はループ外の変数に最終合計を保持したまま .map() を実行していたため，
  // 全月に最終合計が代入され，累計線が水平線になっていた．
  const trend: Array<{
    period: string;
    income: number;
    expense: number;
    balance: number;
    cumulativeIncome: number;
    cumulativeExpense: number;
    cumulativeBalance: number;
  }> = [];
  let cumulativeIncome = 0;
  let cumulativeExpense = 0;
  for (const [key, values] of Array.from(monthlyMap.entries()).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    cumulativeIncome += values.income;
    cumulativeExpense += values.expense;
    trend.push({
      period: key,
      ...values,
      cumulativeIncome,
      cumulativeExpense,
      cumulativeBalance: cumulativeIncome - cumulativeExpense,
    });
  }

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
      date: { gte: new Date(INCOME_EXPENSE_AGGREGATION_START_DATE) },
      isTransfer: false,
      subAccount: subAccountWhere,
    },
    select: { date: true, amount: true },
  });

  const annualMap = new Map<number, { income: number; expense: number }>();

  for (const tx of transactions) {
    // 月キーと同様に UTC getter で年キーを組む
    const year = new Date(tx.date).getUTCFullYear();
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

/**
 * 指定年月の収支データを取得する。
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
 * 収支推移データを取得する。
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
 * 年別収支データを取得する。
 */
export const getAnnualIncomeExpense = async (
  mainAccountId?: string,
  subAccountId?: string,
) => {
  logger.info("Fetching annual income/expense...");
  return getAnnualIncomeExpenseInternal(mainAccountId, subAccountId);
};
