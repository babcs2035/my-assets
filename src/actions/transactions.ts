"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { formatJSTDate } from "@/lib/utils";
import {
  type TransactionCategoryUpdateInput,
  transactionCategoryUpdateSchema,
} from "@/lib/validations";

const toUtcDateOnly = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

/**
 * 取引明細の一覧を取得する関数である．
 * サブ口座，年月，日付，振替の有無などの条件でフィルタリングが可能である．
 * DB 側の skip/take でページネーションを行う．
 */
export async function getTransactions(params: {
  mainAccountId?: string;
  subAccountId?: string;
  year?: number;
  month?: number;
  day?: number;
  page?: number;
  pageSize?: number;
  includeTransfers?: boolean;
}) {
  const {
    mainAccountId,
    subAccountId,
    year,
    month,
    day,
    page = 1,
    pageSize = 50,
    includeTransfers = true,
  } = params;

  logger.info(`📂 Fetching transactions for page ${page}...`);
  if (day) {
    logger.info(`📅 Date filter: ${year}-${month}-${day}`);
  }
  const where: Record<string, unknown> = {};
  const subAccountWhere: Record<string, unknown> = { isHidden: false };
  if (mainAccountId) {
    subAccountWhere.mainAccountId = mainAccountId;
  }
  where.subAccount = subAccountWhere;

  if (subAccountId) where.subAccountId = subAccountId;

  if (year && month) {
    if (day) {
      const start = toUtcDateOnly(year, month, day);
      const end = new Date(start);
      end.setTime(end.getTime() + 24 * 60 * 60 * 1000);
      where.date = { gte: start, lt: end };
      logger.info(
        `📅 Filtering by date: ${formatJSTDate(start)} to ${formatJSTDate(end)}`,
      );
    } else {
      const start = toUtcDateOnly(year, month, 1);
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const end = toUtcDateOnly(nextYear, nextMonth, 1);
      where.date = { gte: start, lt: end };
    }
  }

  if (!includeTransfers) {
    where.isTransfer = false;
  }

  // 振替ペアの重複排除: isTransfer=true かつ amount > 0 の明細を除外
  // (出金側 = amount < 0 のみ残す)
  // scraper は linkedTransId をセットするが transferId は null のため、
  // transferId の有無は問わない
  const transferExclusion: Record<string, unknown> = {
    NOT: {
      isTransfer: true,
      amount: { gt: 0 },
    },
  };

  // 基本フィルタ + 振替重複排除を結合
  const dedupedWhere = { ...where, ...transferExclusion };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: dedupedWhere,
      include: {
        subAccount: {
          include: {
            mainAccount: true,
          },
        },
        subCategory: {
          include: {
            mainCategory: true,
          },
        },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where: dedupedWhere }),
  ]);

  // 振替トランザクションの相手方口座情報を取得する
  const linkedTransIds = transactions
    .filter(tx => tx.isTransfer && tx.linkedTransId)
    .map(tx => tx.linkedTransId as string);

  const linkedTransactions =
    linkedTransIds.length > 0
      ? await prisma.transaction.findMany({
          where: {
            id: { in: linkedTransIds },
            subAccount: { isHidden: false },
          },
          select: {
            id: true,
            subAccount: {
              select: {
                currentName: true,
                mainAccount: {
                  select: {
                    label: true,
                  },
                },
              },
            },
          },
        })
      : [];

  const linkedTransMap = new Map(
    linkedTransactions.map(lt => [
      lt.id,
      {
        mainAccountLabel: lt.subAccount.mainAccount.label,
        subAccountName: lt.subAccount.currentName,
      },
    ]),
  );

  const result = transactions.map(tx => ({
    ...tx,
    linkedAccount: tx.linkedTransId
      ? (linkedTransMap.get(tx.linkedTransId) ?? null)
      : null,
  }));

  return {
    transactions: result,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 指定された年月のカレンダー表示用データを取得する関数である．
 * 日ごとの収入と支出の合計を計算して返す．
 */
export async function getMonthlyCalendarData(
  year: number,
  month: number,
  filters?: {
    mainAccountId?: string;
    subAccountId?: string;
  },
) {
  logger.info(`📅 Fetching monthly calendar data for ${year}-${month}...`);
  const start = toUtcDateOnly(year, month, 1);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = toUtcDateOnly(nextYear, nextMonth, 1);

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      isTransfer: false,
      subAccount: {
        isHidden: false,
        ...(filters?.mainAccountId
          ? { mainAccountId: filters.mainAccountId }
          : {}),
      },
      ...(filters?.subAccountId ? { subAccountId: filters.subAccountId } : {}),
    },
    select: {
      date: true,
      amount: true,
    },
  });

  const dailyData: Record<string, { income: number; expense: number }> = {};
  for (const t of transactions) {
    const key = formatJSTDate(t.date);

    if (!dailyData[key]) {
      dailyData[key] = { income: 0, expense: 0 };
    }
    if (t.amount > 0) {
      dailyData[key].income += t.amount;
    } else {
      dailyData[key].expense += Math.abs(t.amount);
    }
  }

  return dailyData;
}

/**
 * 入出金明細画面のフィルタ候補（金融機関・子口座）を取得する。
 */
export async function getTransactionFilterOptions() {
  const subAccounts = await prisma.subAccount.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      currentName: true,
      sortOrder: true,
      mainAccount: {
        select: {
          id: true,
          label: true,
          sortOrder: true,
        },
      },
    },
    orderBy: [{ mainAccount: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  const mainAccountMap = new Map<
    string,
    {
      id: string;
      label: string;
      sortOrder: number;
      subAccounts: Array<{ id: string; name: string; sortOrder: number }>;
    }
  >();

  for (const sa of subAccounts) {
    const key = sa.mainAccount.id;
    const existing = mainAccountMap.get(key);
    if (existing) {
      existing.subAccounts.push({
        id: sa.id,
        name: sa.currentName,
        sortOrder: sa.sortOrder,
      });
      continue;
    }
    mainAccountMap.set(key, {
      id: sa.mainAccount.id,
      label: sa.mainAccount.label,
      sortOrder: sa.mainAccount.sortOrder,
      subAccounts: [
        {
          id: sa.id,
          name: sa.currentName,
          sortOrder: sa.sortOrder,
        },
      ],
    });
  }

  return Array.from(mainAccountMap.values())
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(ma => ({
      id: ma.id,
      label: ma.label,
      subAccounts: ma.subAccounts
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map(sa => ({ id: sa.id, name: sa.name })),
    }));
}

/**
 * 取引のカテゴリーを更新し，必要に応じて自動分類ルールを作成する関数である．
 */
export async function updateTransactionCategory(
  input: TransactionCategoryUpdateInput,
) {
  requireAuth();
  const data = transactionCategoryUpdateSchema.parse(input);
  logger.info(`📝 Updating category for transaction ${data.transactionId}...`);

  const transaction = await prisma.transaction.update({
    where: { id: data.transactionId },
    data: { subCategoryId: data.subCategoryId },
  });

  if (data.createRule && data.subCategoryId && transaction.desc) {
    logger.info(`➕ Creating auto-category rule for: ${transaction.desc}`);

    await prisma.categoryRule.deleteMany({
      where: { keyword: transaction.desc },
    });

    await prisma.categoryRule.create({
      data: {
        keyword: transaction.desc,
        subCategoryId: data.subCategoryId,
      },
    });

    const result = await prisma.transaction.updateMany({
      where: {
        desc: transaction.desc,
        subCategoryId: null,
      },
      data: {
        subCategoryId: data.subCategoryId,
      },
    });
    logger.info(`✅ Rule applied to ${result.count} transactions.`);
  }

  revalidatePath("/transactions");
  return transaction;
}

/**
 * 未処理の取引から振替 (口座間移動) を自動検出し，マークする関数である．
 * 日付 + 金額でグループ化してペアマッチを行う (O(n) 計算)．
 * 処理対象を直近 3 か月に制限する．
 */
export async function detectTransfers() {
  requireAuth();
  logger.info("🔍 Detecting transfers between accounts...");

  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const unmatched = await prisma.transaction.findMany({
    where: {
      isTransfer: false,
      transferId: null,
      amount: { not: 0 },
      date: { gte: threeMonthsAgo },
      subAccount: { isHidden: false },
    },
    orderBy: { date: "asc" },
  });

  // 日付 + 絶対値金額でグループ化
  const groups = new Map<string, typeof unmatched>();
  for (const tx of unmatched) {
    const key = `${formatJSTDate(tx.date)}|${Math.abs(tx.amount)}`;
    const group = groups.get(key);
    if (group) {
      group.push(tx);
    } else {
      groups.set(key, [tx]);
    }
  }

  const allUpdates: ReturnType<typeof prisma.transaction.update>[] = [];
  let matched = 0;

  for (const [, group] of groups) {
    // 符号ごとに分離
    const debits = group.filter(tx => tx.amount < 0);
    const credits = group.filter(tx => tx.amount > 0);

    if (debits.length === 0 || credits.length === 0) continue;

    const usedDebits = new Set<string>();
    const usedCredits = new Set<string>();

    for (const debit of debits) {
      if (usedDebits.has(debit.id)) continue;

      for (const credit of credits) {
        if (usedCredits.has(credit.id)) continue;
        if (debit.subAccountId === credit.subAccountId) continue;
        if (debit.amount + credit.amount !== 0) continue;

        const transferId = `tf_${debit.id.slice(0, 8)}_${credit.id.slice(0, 8)}`;

        allUpdates.push(
          prisma.transaction.update({
            where: { id: debit.id },
            data: {
              isTransfer: true,
              transferId,
              linkedTransId: credit.id,
            },
          }),
          prisma.transaction.update({
            where: { id: credit.id },
            data: {
              isTransfer: true,
              transferId,
              linkedTransId: debit.id,
            },
          }),
        );

        usedDebits.add(debit.id);
        usedCredits.add(credit.id);
        matched++;
        break;
      }
    }
  }

  if (allUpdates.length > 0) {
    await prisma.$transaction(allUpdates);
  }

  logger.info(`✅ Detected and linked ${matched} transfer pairs.`);
  revalidatePath("/transactions");
  return { matched };
}
