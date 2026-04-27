"use server";

import { revalidatePath } from "next/cache";
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

  console.log(`📂 Fetching transactions for page ${page}...`);
  if (day) {
    console.log(`📅 Date filter: ${year}-${month}-${day}`);
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
      // 特定の日付のみを取得
      // データベースの date カラムは @db.Date で時刻なしなので、
      // YYYY-MM-DD の文字列形式で比較する
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const start = toUtcDateOnly(year, month, day);
      const end = new Date(start);
      end.setTime(end.getTime() + 24 * 60 * 60 * 1000);
      where.date = { gte: start, lt: end };
      console.log(
        `📅 Filtering by date: ${dateStr} (${formatJSTDate(start)} to ${formatJSTDate(end)})`,
      );
    } else {
      // 月全体を取得
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

  // 振替ペアの重複を排除するため，同じ transferId の入金側を除外する
  // (出金側 = amount < 0 のみ残す)
  // まず振替ペアの重複数をカウントして total を補正する
  const transferDuplicateCount = await prisma.transaction.count({
    where: {
      ...where,
      isTransfer: true,
      amount: { gt: 0 },
      transferId: { not: null },
    },
  });

  const [rawTransactions, rawTotal] = await Promise.all([
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
      // ページネーション用に多めに取得し，後でフィルタリングする
      skip: 0,
      take: Number.MAX_SAFE_INTEGER,
    }),
    prisma.transaction.count({ where }),
  ]);

  // 振替ペアの重複排除: 同じ transferId の入金側 (amount > 0) を除外する
  const deduplicatedTransactions = rawTransactions.filter(tx => {
    if (!tx.isTransfer || !tx.transferId) return true;
    // 出金側 (amount < 0) のみ残す
    return tx.amount < 0;
  });

  // ページネーション適用
  const total = rawTotal - transferDuplicateCount;
  const paginatedTransactions = deduplicatedTransactions.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  // 振替トランザクションの相手方口座情報を取得する
  const linkedTransIds = paginatedTransactions
    .filter(tx => tx.isTransfer && tx.linkedTransId)
    .map(tx => tx.linkedTransId as string);

  // 相手方トランザクションの口座情報を一括取得
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

  // 相手方トランザクション ID → 口座情報のマップを作成
  const linkedTransMap = new Map(
    linkedTransactions.map(lt => [
      lt.id,
      {
        mainAccountLabel: lt.subAccount.mainAccount.label,
        subAccountName: lt.subAccount.currentName,
      },
    ]),
  );

  // 各トランザクションに相手方の口座情報を付与する
  const transactions = paginatedTransactions.map(tx => ({
    ...tx,
    linkedAccount: tx.linkedTransId
      ? (linkedTransMap.get(tx.linkedTransId) ?? null)
      : null,
  }));

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
export async function getMonthlyCalendarData(
  year: number,
  month: number,
  filters?: {
    mainAccountId?: string;
    subAccountId?: string;
  },
) {
  console.log(`📅 Fetching monthly calendar data for ${year}-${month}...`);
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
    // JST の日付文字列を取得
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
  const data = transactionCategoryUpdateSchema.parse(input);
  console.log(`📝 Updating category for transaction ${data.transactionId}...`);

  const transaction = await prisma.transaction.update({
    where: { id: data.transactionId },
    data: { subCategoryId: data.subCategoryId },
  });

  if (data.createRule && data.subCategoryId && transaction.desc) {
    console.log(`➕ Creating auto-category rule for: ${transaction.desc}`);

    // 古い同じキーワードのルールが存在すれば削除して重複を防ぐ
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
    console.log(`✅ Rule applied to ${result.count} transactions.`);
  }

  revalidatePath("/transactions");
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
      subAccount: { isHidden: false },
    },
    orderBy: { date: "asc" },
  });

  let matched = 0;

  for (let i = 0; i < unmatched.length; i++) {
    for (let j = i + 1; j < unmatched.length; j++) {
      const a = unmatched[i];
      const b = unmatched[j];

      if (
        formatJSTDate(a.date) === formatJSTDate(b.date) &&
        Math.abs(a.amount) === Math.abs(b.amount) &&
        a.amount !== 0 &&
        a.amount + b.amount === 0
      ) {
        const transferId = `tf_${a.id.slice(0, 8)}_${b.id.slice(0, 8)}`;

        // アトミックにトランザクションを更新
        await prisma.$transaction([
          prisma.transaction.update({
            where: { id: a.id },
            data: {
              isTransfer: true,
              transferId,
              linkedTransId: b.id,
            },
          }),
          prisma.transaction.update({
            where: { id: b.id },
            data: {
              isTransfer: true,
              transferId,
              linkedTransId: a.id,
            },
          }),
        ]);

        matched++;
        break;
      }
    }
  }

  console.log(`✅ Detected and linked ${matched} transfer pairs.`);
  revalidatePath("/transactions");
  return { matched };
}
