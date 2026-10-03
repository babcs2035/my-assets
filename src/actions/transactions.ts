"use server";

import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  revalidateSettingsAndTransactionPages,
  revalidateSettingsPage,
  revalidateTransactionsPage,
} from "@/lib/revalidate";
import { formatJSTDate } from "@/lib/utils";
import {
  type TransactionCategoryUpdateInput,
  type TransferMarkInput,
  type TransferRuleCreateInput,
  type TransferRuleUpdateInput,
  transactionCategoryUpdateSchema,
  transferMarkSchema,
  transferRuleCreateSchema,
  transferRuleUpdateSchema,
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
  const data = transactionCategoryUpdateSchema.parse(input);
  logger.info(`📝 Updating category for transaction ${data.transactionId}...`);

  const transaction = await prisma.transaction.update({
    where: { id: data.transactionId },
    data: { subCategoryId: data.subCategoryId },
  });

  if (data.createRule && data.subCategoryId && transaction.desc) {
    logger.info(`➕ Creating auto-category rule for: ${transaction.desc}`);

    // 旧ルールの削除だけが成功して新ルールがない状態を残さないよう，まとめて実行する
    const [, , result] = await prisma.$transaction([
      prisma.categoryRule.deleteMany({
        where: { keyword: transaction.desc },
      }),
      prisma.categoryRule.create({
        data: {
          keyword: transaction.desc,
          subCategoryId: data.subCategoryId,
        },
      }),
      prisma.transaction.updateMany({
        where: {
          desc: transaction.desc,
          subCategoryId: null,
        },
        data: {
          subCategoryId: data.subCategoryId,
        },
      }),
    ]);
    logger.info(`✅ Rule applied to ${result.count} transactions.`);
  }

  revalidateTransactionsPage();
  return transaction;
}

/**
 * 未処理の取引から振替 (口座間移動) を自動検出し，マークする関数である．
 * 日付 + 金額でグループ化してペアマッチを行う (O(n) 計算)．
 * 処理対象を直近 3 か月に制限する．
 */
export async function detectTransfers() {
  logger.info("🔍 Detecting transfers between accounts...");

  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);

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
  revalidateTransactionsPage();
  return { matched };
}

/**
 * 指定された取引明細を振替扱いに設定する関数である．
 * 出金側の明細を更新し，振替先口座に受信側の明細を自動生成する．
 * 振替先口座の残高は更新しない（入出金明細上のペアとしてのみ管理）．
 */
export async function markTransactionAsTransfer(input: TransferMarkInput) {
  const data = transferMarkSchema.parse(input);
  logger.info(
    `🔄 Marking transaction ${data.transactionId} as transfer to ${data.targetSubAccountId}`,
  );

  const source = await prisma.transaction.findUnique({
    where: { id: data.transactionId },
    select: {
      id: true,
      date: true,
      amount: true,
      desc: true,
      subAccountId: true,
      isTransfer: true,
    },
  });

  if (!source) {
    logger.warn(`Source transaction ${data.transactionId} not found.`);
    throw new Error("出金元明細が見つかりません．");
  }

  if (source.isTransfer) {
    throw new Error("既に振替扱いの明細です．");
  }

  if (source.subAccountId === data.targetSubAccountId) {
    throw new Error("同じ口座には振替できません．");
  }

  // 出金側: amount < 0 ならそのまま，amount > 0 なら符号を反転
  const sourceAmount = source.amount > 0 ? -source.amount : source.amount;

  const transferId = `tf_${source.id.slice(0, 8)}_${Date.now()}`;

  // 受信側IDを先に生成し，両側をトランザクションとして一括更新
  const targetId = crypto.randomUUID();

  await prisma.$transaction(async tx => {
    // 出金側を原子に「確保」する．isTransfer=false を条件に updateMany し，
    // 並行呼び出しが既にマークした場合 count=0 になるのでロールバックして
    // 受信側明細の重複生成を防ぐ（単独の update ではチェックと更新が分離され
    // レースが生じるため）．
    const claimed = await tx.transaction.updateMany({
      where: { id: source.id, isTransfer: false },
      data: {
        isTransfer: true,
        transferId,
        linkedTransId: targetId,
      },
    });
    if (claimed.count === 0) {
      throw new Error("既に振替扱いの明細です．");
    }

    // 受信側明細を生成
    await tx.transaction.create({
      data: {
        id: targetId,
        subAccountId: data.targetSubAccountId,
        date: source.date,
        amount: Math.abs(sourceAmount),
        desc: source.desc,
        isTransfer: true,
        transferId,
        linkedTransId: source.id,
      },
    });
  });

  logger.info(`✅ Marked as transfer: ${transferId}`);

  // 摘要に基づき自動で振替ルールを作成する
  if (data.createRule && source.desc) {
    logger.info(`➕ Creating auto-transfer rule for: ${source.desc}`);
    // 旧ルールの削除だけが成功して新ルールがない状態を残さないよう，まとめて実行する
    await prisma.$transaction([
      prisma.transferRule.deleteMany({
        where: { keyword: source.desc },
      }),
      prisma.transferRule.create({
        data: {
          keyword: source.desc,
          targetSubAccountId: data.targetSubAccountId,
        },
      }),
    ]);
    revalidateSettingsPage();
  }

  revalidateTransactionsPage();
  return { transferId };
}

/**
 * 振替ルールの一覧を取得する関数である．
 * 各ルールに振替先口座の詳細情報を含める．
 */
export async function getTransferRules() {
  logger.info("📜 Fetching transfer rules...");
  return prisma.transferRule.findMany({
    include: {
      targetSubAccount: {
        include: {
          mainAccount: true,
        },
      },
    },
  });
}

/**
 * 新しい振替ルールを作成する関数である．
 * 同じキーワードを持つ既存のルールを削除してから新規作成する（upsert的な動作）．
 */
export async function createTransferRule(input: TransferRuleCreateInput) {
  const data = transferRuleCreateSchema.parse(input);
  logger.info(`➕ Creating transfer rule for keyword: ${data.keyword}`);

  // 同じキーワードを持つ既存のルールを削除してから新規作成する．
  // 削除と作成を 1 つのトランザクションにまとめる（作成失敗で既存ルールが
  // 消えないようにするため）
  const result = await prisma.$transaction(async tx => {
    await tx.transferRule.deleteMany({ where: { keyword: data.keyword } });
    return tx.transferRule.create({ data });
  });
  revalidateSettingsAndTransactionPages();
  return result;
}

/**
 * 振替ルールを更新する関数である．
 */
export async function updateTransferRule(
  id: string,
  input: TransferRuleUpdateInput,
) {
  const data = transferRuleUpdateSchema.parse(input);
  logger.info(`📝 Updating transfer rule: ${id}`);
  const result = await prisma.transferRule.update({
    where: { id },
    data,
  });
  revalidateSettingsPage();
  return result;
}

/**
 * 振替ルールを削除する関数である．
 */
export async function deleteTransferRule(id: string) {
  logger.info(`🗑️ Deleting transfer rule: ${id}`);
  const result = await prisma.transferRule.delete({
    where: { id },
  });
  revalidateSettingsPage();
  return result;
}

/**
 * 定義されたすべての振替ルールを，未処理の取引に対して一括適用する関数である．
 * 各ルールは摘要がキーワードに一致する取引を
 * 振替先口座の反対符号の取引とペアリングして振替扱いにマークする．
 */
export async function applyAllTransferRules() {
  logger.info("Applying all transfer rules to transactions...");
  const rules = await prisma.transferRule.findMany({});

  let pairsMarked = 0;
  let pairsSkipped = 0;

  // 確定したペアの更新を蓄積し，最後に一括適用する．
  // 元の実装は 1 ペア候補ごとに findFirst + findUnique + $transaction を発しており，
  // ルール数 × 明細数に比例した DB 往復（N+1）になっていた．
  const updates: Array<{
    where: { id: string };
    data: { isTransfer: boolean; transferId: string; linkedTransId: string };
  }> = [];
  const markedSourceIds = new Set<string>();
  const markedTargetIds = new Set<string>();

  for (const rule of rules) {
    // キーワードに一致する未処理の出金側取引を取得（1 クエリ / ルール）
    const sourceTransactions = await prisma.transaction.findMany({
      where: {
        desc: { contains: rule.keyword, mode: "insensitive" },
        isTransfer: false,
        subAccount: { isHidden: false },
      },
      select: {
        id: true,
        subAccountId: true,
        amount: true,
        date: true,
      },
    });

    if (sourceTransactions.length === 0) continue;

    // 振替先口座の，対象日付・金額の取引を 1 クエリで取得しメモリで照合する
    const targetTransactions = await prisma.transaction.findMany({
      where: {
        subAccountId: rule.targetSubAccountId,
        isTransfer: false,
        date: { in: sourceTransactions.map(t => t.date) },
        amount: { in: sourceTransactions.map(t => -t.amount) },
      },
      select: { id: true, amount: true, date: true },
    });

    // (JST 日付, 金額) → 未使用 target id のスタックで O(1) 照合
    const targetIndex = new Map<string, string[]>();
    for (const t of targetTransactions) {
      const key = `${formatJSTDate(t.date)}|${t.amount}`;
      const stack = targetIndex.get(key);
      if (stack) stack.push(t.id);
      else targetIndex.set(key, [t.id]);
    }

    for (const sourceTx of sourceTransactions) {
      // 別のルールで既にマーク済み（メモリ上）の場合はスキップ．
      // 出金側として消費済み（markedSourceIds）か，振替先として消費済み
      // （markedTargetIds）かの両方を確認する．バッチ適用のためループ中は
      // DB の isTransfer がまだ更新されないので，メモリ上のフラグで排他し，
      // 同一明細が updates に 2 件入って transferId が上書きされるのを防ぐ．
      if (
        markedSourceIds.has(sourceTx.id) ||
        markedTargetIds.has(sourceTx.id)
      ) {
        continue;
      }

      const key = `${formatJSTDate(sourceTx.date)}|${-sourceTx.amount}`;
      const stack = targetIndex.get(key);
      if (!stack) continue;

      // 未使用の target を 1 つ取り出す
      let targetId: string | undefined;
      while (stack.length > 0) {
        const id = stack.pop() as string;
        if (!markedTargetIds.has(id)) {
          targetId = id;
          break;
        }
      }
      if (!targetId) {
        pairsSkipped++;
        continue;
      }

      markedSourceIds.add(sourceTx.id);
      markedTargetIds.add(targetId);

      const transferId = `tf_${sourceTx.id.slice(0, 8)}_${targetId.slice(0, 8)}`;
      updates.push(
        {
          where: { id: sourceTx.id },
          data: { isTransfer: true, transferId, linkedTransId: targetId },
        },
        {
          where: { id: targetId },
          data: { isTransfer: true, transferId, linkedTransId: sourceTx.id },
        },
      );
      pairsMarked++;
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates.map(u => prisma.transaction.update(u)));
  }

  logger.info(
    `Transfer rules applied: ${pairsMarked} pairs marked, ${pairsSkipped} pairs skipped.`,
  );
  revalidateTransactionsPage();
  return { pairsMarked, pairsSkipped };
}
