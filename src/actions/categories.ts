"use server";

import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  revalidateSettingsAndTransactionPages,
  revalidateSettingsPage,
  revalidateTransactionsPage,
} from "@/lib/revalidate";
import {
  type CategoryRuleCreateInput,
  type CategoryRuleUpdateInput,
  categoryImportSchema,
  categoryRuleCreateSchema,
  categoryRuleUpdateSchema,
  type MainCategoryCreateInput,
  type MainCategoryUpdateInput,
  mainCategoryCreateSchema,
  mainCategoryUpdateSchema,
  type SubCategoryCreateInput,
  type SubCategoryUpdateInput,
  subCategoryCreateSchema,
  subCategoryUpdateSchema,
} from "@/lib/validations";

/**
 * すべてのメインカテゴリーおよびサブカテゴリーの情報を取得する関数である．
 * 各サブカテゴリーに紐付く取引数やルールの数も併せて取得する．
 */
export async function getCategories() {
  logger.info("Fetching categories...");
  return prisma.mainCategory.findMany({
    include: {
      subCategories: {
        include: {
          _count: {
            select: { transactions: true, rules: true },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

/**
 * 新しいメインカテゴリーを作成する関数である．
 */
export async function createMainCategory(input: MainCategoryCreateInput) {
  const data = mainCategoryCreateSchema.parse(input);
  logger.info(`Creating main category: ${data.name}`);

  // 同じタイプの最大 sortOrder を取得し，末尾に追加する
  const maxOrder = await prisma.mainCategory.aggregate({
    where: { type: data.type },
    _max: { sortOrder: true },
  });
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const result = await prisma.mainCategory.create({
    data: {
      ...data,
      sortOrder: nextOrder,
    },
  });
  revalidateSettingsAndTransactionPages();
  return result;
}

/**
 * メインカテゴリーの名前を更新する関数である．
 * 同じ type 内で同名が存在する場合，Error をスローする．
 */
export async function updateMainCategory(
  id: string,
  input: MainCategoryUpdateInput,
) {
  const data = mainCategoryUpdateSchema.parse(input);
  logger.info(`📝 Updating main category ${id} to "${data.name}"`);

  // 既存カテゴリーを取得（type は一意制約のチェックに必要）
  const existing = await prisma.mainCategory.findUnique({ where: { id } });
  if (!existing) throw new Error("カテゴリーが見つかりません");

  // 同じ type 内で同名のカテゴリーが存在するかチェック（自分自身は除外）
  const duplicate = await prisma.mainCategory.findFirst({
    where: {
      name: data.name,
      type: existing.type,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new Error(
      `同じ"${existing.type}"カテゴリーに"${data.name}"は既に存在します`,
    );
  }

  const result = await prisma.mainCategory.update({
    where: { id },
    data: { name: data.name },
  });
  revalidateSettingsAndTransactionPages();
  return result;
}

/**
 * メインカテゴリーを削除する関数である．
 */
export async function deleteMainCategory(id: string) {
  logger.info(`🗑️ Deleting main category: ${id}`);
  // 参照解除・ルール削除・サブカテゴリー削除・メインカテゴリー削除を
  // 1 つのトランザクションにまとめる．別クエリに分割すると，最後の
  // mainCategory 削除が失敗したとき（SubCategoryItem.mainCategory は
  // Restrict なのでサブカテゴリー存在時は必ず失敗する）前半の
  // 「ルール削除・取引の subCategoryId null 化」だけ確定し，分類が
  // 失われたままカテゴリーが残る破損状態になるため．
  const result = await prisma.$transaction(async tx => {
    const subCategories = await tx.subCategoryItem.findMany({
      where: { mainCategoryId: id },
      select: { id: true },
    });
    const subCategoryIds = subCategories.map(sc => sc.id);

    if (subCategoryIds.length > 0) {
      // サブカテゴリーに紐付くトランザクションの subCategoryId を null にする
      await tx.transaction.updateMany({
        where: { subCategoryId: { in: subCategoryIds } },
        data: { subCategoryId: null },
      });
      await tx.categoryRule.deleteMany({
        where: { subCategoryId: { in: subCategoryIds } },
      });
      // Restrict 制約を回避するため，サブカテゴリー自体も削除する
      await tx.subCategoryItem.deleteMany({
        where: { id: { in: subCategoryIds } },
      });
    }

    return tx.mainCategory.delete({
      where: { id },
    });
  });
  revalidateSettingsAndTransactionPages();
  return result;
}

/**
 * 新しいサブカテゴリーを作成する関数である．
 */
export async function createSubCategory(input: SubCategoryCreateInput) {
  const data = subCategoryCreateSchema.parse(input);
  logger.info(`➕ Creating sub category: ${data.name}`);

  // 同じメインカテゴリー内の最大 sortOrder を取得し，末尾に追加する
  const maxOrder = await prisma.subCategoryItem.aggregate({
    where: { mainCategoryId: data.mainCategoryId },
    _max: { sortOrder: true },
  });
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const result = await prisma.subCategoryItem.create({
    data: {
      ...data,
      sortOrder: nextOrder,
    },
  });
  revalidateSettingsAndTransactionPages();
  return result;
}

/**
 * サブカテゴリーの名前を更新する関数である．
 * 同じメインカテゴリー内で同名が存在する場合，Error をスローする．
 */
export async function updateSubCategory(
  id: string,
  input: SubCategoryUpdateInput,
) {
  const data = subCategoryUpdateSchema.parse(input);
  logger.info(`📝 Updating sub category ${id} to "${data.name}"`);

  // 既存カテゴリーを取得（mainCategoryId は一意制約のチェックに必要）
  const existing = await prisma.subCategoryItem.findUnique({ where: { id } });
  if (!existing) throw new Error("サブカテゴリーが見つかりません");

  // 同じ mainCategoryId 内で同名のサブカテゴリーが存在するかチェック（自分自身は除外）
  const duplicate = await prisma.subCategoryItem.findFirst({
    where: {
      name: data.name,
      mainCategoryId: existing.mainCategoryId,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new Error(`同じ親カテゴリーに"${data.name}"は既に存在します`);
  }

  const result = await prisma.subCategoryItem.update({
    where: { id },
    data: { name: data.name },
  });
  revalidateSettingsAndTransactionPages();
  return result;
}

/**
 * サブカテゴリーを削除する関数である．
 */
export async function deleteSubCategory(id: string) {
  logger.info(`🗑️ Deleting sub category: ${id}`);
  // 紐付くトランザクションのsubCategoryIdをnullにする．
  // 最後の削除だけが失敗して分類とルールだけが消えないよう，1 つのトランザクションにまとめる
  const [, , result] = await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { subCategoryId: id },
      data: { subCategoryId: null },
    }),
    prisma.categoryRule.deleteMany({
      where: { subCategoryId: id },
    }),
    prisma.subCategoryItem.delete({
      where: { id },
    }),
  ]);
  revalidateSettingsAndTransactionPages();
  return result;
}

/**
 * すべてのカテゴリールールを取得する関数である．
 * ルールには適用優先順位 (priority) があり，降順で取得する．
 */
export async function getCategoryRules() {
  logger.info("📜 Fetching category rules...");
  return prisma.categoryRule.findMany({
    include: {
      subCategory: {
        include: {
          mainCategory: true,
        },
      },
    },
    orderBy: { priority: "desc" },
  });
}

/**
 * 新しいカテゴリールールを作成する関数である．
 */
export async function createCategoryRule(input: CategoryRuleCreateInput) {
  const data = categoryRuleCreateSchema.parse(input);
  logger.info(`➕ Creating category rule for keyword: ${data.keyword}`);

  // 同じキーワードを持つ既存のルールを削除してから新規作成する．
  // 削除と作成を 1 つのトランザクションにまとめる（作成失敗で既存ルールが
  // 消えないようにするため）
  const result = await prisma.$transaction(async tx => {
    await tx.categoryRule.deleteMany({ where: { keyword: data.keyword } });
    return tx.categoryRule.create({ data });
  });
  revalidateSettingsAndTransactionPages();
  return result;
}

/**
 * カテゴリールールを更新する関数である．
 */
export async function updateCategoryRule(
  id: string,
  input: CategoryRuleUpdateInput,
) {
  const data = categoryRuleUpdateSchema.parse(input);
  logger.info(`📝 Updating category rule: ${id}`);
  const result = await prisma.categoryRule.update({
    where: { id },
    data,
  });
  revalidateSettingsPage();
  return result;
}

/**
 * カテゴリールールを削除する関数である．
 */
export async function deleteCategoryRule(id: string) {
  logger.info(`🗑️ Deleting category rule: ${id}`);
  const result = await prisma.categoryRule.delete({
    where: { id },
  });
  revalidateSettingsPage();
  return result;
}

/**
 * 定義されたすべてのカテゴリールールを，未分類の取引に対して一括適用する関数である．
 * 優先順位の高いルールから順に適用され，適用された取引の総数を返す．
 */
export async function applyAllCategoryRules() {
  logger.info("Applying all category rules to unclassified transactions...");
  const rules = await prisma.categoryRule.findMany({
    orderBy: { priority: "desc" },
  });

  let applied = 0;

  for (const rule of rules) {
    const result = await prisma.transaction.updateMany({
      where: {
        desc: { contains: rule.keyword, mode: "insensitive" },
        subCategoryId: null,
      },
      data: {
        subCategoryId: rule.subCategoryId,
      },
    });
    applied += result.count;
  }

  logger.info(`Category rules applied to ${applied} transactions.`);
  revalidateTransactionsPage();
  return { applied };
}

/**
 * メインカテゴリーの並び順を一括更新する関数である．
 * 同じ type 内の ID 配列を受け取り，順番通りに sortOrder を振り直す．
 */
export async function reorderMainCategories(
  type: "INCOME" | "EXPENSE",
  orderedIds: string[],
) {
  logger.info(`Reordering main categories in ${type}...`);
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.mainCategory.update({
        where: { id, type },
        data: { sortOrder: index },
      }),
    ),
  );
  revalidateSettingsPage();
}

/**
 * サブカテゴリーの並び順を一括更新する関数である．
 * 同じメインカテゴリー配下の ID 配列を受け取り，順番通りに sortOrder を振り直す．
 */
export async function reorderSubCategories(
  mainCategoryId: string,
  orderedIds: string[],
) {
  logger.info(
    `Reordering sub categories in main category ${mainCategoryId}...`,
  );
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.subCategoryItem.update({
        where: { id, mainCategoryId },
        data: { sortOrder: index },
      }),
    ),
  );
  revalidateSettingsPage();
}

/**
 * カテゴリー・ルールデータを JSON 形式でエクスポートする関数である．
 * すべての MainCategory，SubCategoryItem，CategoryRule をネスト構造で取得する．
 */
export async function exportCategories() {
  logger.info("Exporting categories...");
  const categories = await prisma.mainCategory.findMany({
    include: {
      subCategories: {
        include: {
          rules: {
            select: { keyword: true, priority: true },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const exportData = {
    exportedAt: new Date().toISOString(),
    categories: categories.map(mc => ({
      name: mc.name,
      type: mc.type,
      subCategories: mc.subCategories.map(sc => ({
        name: sc.name,
        rules: sc.rules.map(r => ({
          keyword: r.keyword,
          priority: r.priority,
        })),
      })),
    })),
  };

  return exportData;
}

/**
 * カテゴリー・ルールデータを JSON からインポートする関数である．
 * 既存の MainCategory，SubCategoryItem，CategoryRule を全削除後，インポートデータで上書きする．
 * 明細の分類は，種別・メインカテゴリー名・サブカテゴリー名が同じサブカテゴリーがインポート後にもあれば付け直し，なければ未分類になる．
 */
export async function importCategories(data: unknown) {
  const parsed = categoryImportSchema.parse(data);
  logger.info(
    `Importing categories with ${parsed.categories.length} main categories`,
  );

  // 全削除と再構築を 1 つの相互作用トランザクションにまとめる．
  // 別トランザクションに分割すると，作成側が失敗したとき（例: インポートに
  // 同名の重複があり unique 制約に違反）削除は確定したまま作成だけロールバックし，
  // 全カテゴリー・ルールが失われるため，原子性を保つ．
  await prisma.$transaction(async tx => {
    // 以前は削除で明細の分類がすべて外れ，エクスポートにも明細の分類は含まれないので戻せなかった（SET-5）．
    // サブカテゴリーの ID は作り直すと変わるので，名前の組で控えておき，作り直した後に付け直す
    const categoryKey = (type: string, mainName: string, subName: string) =>
      `${type}\u0000${mainName}\u0000${subName}`;
    const previousSubCategories = await tx.subCategoryItem.findMany({
      select: {
        name: true,
        mainCategory: { select: { name: true, type: true } },
        transactions: { select: { id: true } },
      },
    });

    // 既存データを全削除（Transaction は保持）
    // Transaction.subCategory の外部キーは ON DELETE SET NULL だが，
    // deleteMainCategory / deleteSubCategory と同じく参照を先に明示的に null 化する．
    // CategoryRule.subCategory は ON DELETE RESTRICT なので，ルールは先に削除する必要がある
    await tx.transaction.updateMany({
      where: { subCategoryId: { not: null } },
      data: { subCategoryId: null },
    });
    await tx.categoryRule.deleteMany();
    await tx.subCategoryItem.deleteMany();
    await tx.mainCategory.deleteMany();

    // 各 type 内の sortOrder をインデックスで計算（DB は空なので自前で管理）
    const typeCounter: Record<string, number> = { INCOME: 0, EXPENSE: 0 };
    const createPromises = parsed.categories.map(mc => {
      const sortOrder = typeCounter[mc.type]++;

      return tx.mainCategory.create({
        data: {
          name: mc.name,
          type: mc.type,
          sortOrder: sortOrder,
          subCategories: {
            create: mc.subCategories.map((sc, scIndex) => ({
              name: sc.name,
              sortOrder: scIndex,
              rules: {
                create: sc.rules.map(r => ({
                  keyword: r.keyword,
                  priority: r.priority,
                })),
              },
            })),
          },
        },
      });
    });
    await Promise.all(createPromises);

    const createdSubCategories = await tx.subCategoryItem.findMany({
      select: {
        id: true,
        name: true,
        mainCategory: { select: { name: true, type: true } },
      },
    });
    const createdIdByKey = new Map(
      createdSubCategories.map(sc => [
        categoryKey(sc.mainCategory.type, sc.mainCategory.name, sc.name),
        sc.id,
      ]),
    );
    let restoredCount = 0;
    for (const sc of previousSubCategories) {
      const newId = createdIdByKey.get(
        categoryKey(sc.mainCategory.type, sc.mainCategory.name, sc.name),
      );
      if (!newId || sc.transactions.length === 0) continue;
      const { count } = await tx.transaction.updateMany({
        where: { id: { in: sc.transactions.map(t => t.id) } },
        data: { subCategoryId: newId },
      });
      restoredCount += count;
    }
    logger.info(`Restored categories of ${restoredCount} transactions.`);
  });

  revalidateSettingsAndTransactionPages();
  logger.info("Categories imported successfully.");
}
