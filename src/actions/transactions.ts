"use server";

import { prisma } from "@/lib/prisma";
import {
  type TransactionCategoryUpdateInput,
  transactionCategoryUpdateSchema,
} from "@/lib/validations";

/**
 * 取引明細の一覧を取得する関数である．
 * サブ口座，年月，振替の有無などの条件でフィルタリングが可能である．
 */
export async function getTransactions(params: {
  subAccountId?: string;
  year?: number;
  month?: number;
  page?: number;
  pageSize?: number;
  includeTransfers?: boolean;
}) {
  const {
    subAccountId,
    year,
    month,
    page = 1,
    pageSize = 50,
    includeTransfers = true,
  } = params;

  console.log(`📂 Fetching transactions for page ${page}...`);
  const where: Record<string, unknown> = {};

  if (subAccountId) where.subAccountId = subAccountId;

  if (year && month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    where.date = { gte: start, lt: end };
  }

  if (!includeTransfers) {
    where.isTransfer = false;
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
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
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions,
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
export async function getMonthlyCalendarData(year: number, month: number) {
  console.log(`📅 Fetching monthly calendar data for ${year}-${month}...`);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      isTransfer: false,
    },
    select: {
      date: true,
      amount: true,
    },
  });

  const dailyData: Record<string, { income: number; expense: number }> = {};
  for (const t of transactions) {
    const key = t.date.toISOString().split("T")[0];
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
 * 取引のカテゴリーを更新し，必要に応じて自動分類ルールを作成する関数である．
 */
export async function updateTransactionCategory(
  input: TransactionCategoryUpdateInput,
) {
  const data = transactionCategoryUpdateSchema.parse(input);
  console.log(`📝 Updating category for transaction ${data.transactionId}...`);

  const transaction = await prisma.transaction.update({
    where: { id: data.transactionId },
    data: { subCategoryId: data.subCategoryId },
  });

  if (data.createRule && data.subCategoryId && transaction.desc) {
    console.log(`➕ Creating auto-category rule for: ${transaction.desc}`);
    await prisma.categoryRule.upsert({
      where: {
        keyword_subCategoryId: {
          keyword: transaction.desc,
          subCategoryId: data.subCategoryId,
        },
      },
      create: {
        keyword: transaction.desc,
        subCategoryId: data.subCategoryId,
      },
      update: {},
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
    console.log(`✅ Rule applied to ${result.count} transactions.`);
  }

  return transaction;
}

/**
 * 未処理の取引から振替 (口座間移動) を自動検出し，マークする関数である．
 * 同じ日付かつ絶対値が同じ反対符号の取引をペアとして識別する．
 */
export async function detectTransfers() {
  console.log("🔍 Detecting transfers between accounts...");
  const unmatched = await prisma.transaction.findMany({
    where: {
      isTransfer: false,
      transferId: null,
    },
    orderBy: { date: "asc" },
  });

  let matched = 0;

  for (let i = 0; i < unmatched.length; i++) {
    for (let j = i + 1; j < unmatched.length; j++) {
      const a = unmatched[i];
      const b = unmatched[j];

      if (
        a.date.getTime() === b.date.getTime() &&
        Math.abs(a.amount) === Math.abs(b.amount) &&
        a.amount !== 0 &&
        a.amount + b.amount === 0
      ) {
        const transferId = `tf_${a.id.slice(0, 8)}_${b.id.slice(0, 8)}`;
        await prisma.transaction.updateMany({
          where: { id: { in: [a.id, b.id] } },
          data: {
            isTransfer: true,
            transferId,
          },
        });
        await prisma.transaction.update({
          where: { id: a.id },
          data: { linkedTransId: b.id },
        });
        await prisma.transaction.update({
          where: { id: b.id },
          data: { linkedTransId: a.id },
        });
        matched++;
        break;
      }
    }
  }

  console.log(`✅ Detected and linked ${matched} transfer pairs.`);
  return { matched };
}
