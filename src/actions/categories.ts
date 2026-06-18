"use server";

import { revalidatePath } from "next/cache";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
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
  revalidatePath("/settings");
  revalidatePath("/transactions");
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
  revalidatePath("/settings");
  revalidatePath("/transactions");
  return result;
}

/**
 * メインカテゴリーを削除する関数である．
 */
export async function deleteMainCategory(id: string) {
  logger.info(`🗑️ Deleting main category: ${id}`);
  // サブカテゴリーに紐付くトランザクションのsubCategoryIdをnullにする
  const subCategories = await prisma.subCategoryItem.findMany({
    where: { mainCategoryId: id },
    select: { id: true },
  });
  const subCategoryIds = subCategories.map(sc => sc.id);

  if (subCategoryIds.length > 0) {
    await prisma.transaction.updateMany({
      where: { subCategoryId: { in: subCategoryIds } },
      data: { subCategoryId: null },
    });
    await prisma.categoryRule.deleteMany({
      where: { subCategoryId: { in: subCategoryIds } },
    });
  }

  const result = await prisma.mainCategory.delete({
    where: { id },
  });
  revalidatePath("/settings");
  revalidatePath("/transactions");
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
  revalidatePath("/settings");
  revalidatePath("/transactions");
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
  revalidatePath("/settings");
  revalidatePath("/transactions");
  return result;
}

/**
 * サブカテゴリーを削除する関数である．
 */
export async function deleteSubCategory(id: string) {
  logger.info(`🗑️ Deleting sub category: ${id}`);
  // 紐付くトランザクションのsubCategoryIdをnullにする
  await prisma.transaction.updateMany({
    where: { subCategoryId: id },
    data: { subCategoryId: null },
  });
  await prisma.categoryRule.deleteMany({
    where: { subCategoryId: id },
  });
  const result = await prisma.subCategoryItem.delete({
    where: { id },
  });
  revalidatePath("/settings");
  revalidatePath("/transactions");
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

  // 同じキーワードを持つ既存のルールを削除してから新規作成する
  await prisma.categoryRule.deleteMany({
    where: { keyword: data.keyword },
  });

  const result = await prisma.categoryRule.create({ data });
  revalidatePath("/settings");
  revalidatePath("/transactions");
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
  revalidatePath("/settings");
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
  revalidatePath("/settings");
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
  revalidatePath("/transactions");
  return { applied };
}

/**
 * メインカテゴリーの表示順序を入れ替える関数である．
 * 同じタイプ内での上下移動を想定している．
 * sortOrder が重複している場合でも，まず正規化してからスワップすることで確実に動作する．
 */
export async function reorderMainCategory(
  id: string,
  direction: "up" | "down",
) {
  logger.info(`Reordering category ${id} ${direction}...`);

  const target = await prisma.mainCategory.findUnique({ where: { id } });
  if (!target) throw new Error("Category not found");

  // 同じタイプのカテゴリーを sortOrder 順に取得する
  const siblings = await prisma.mainCategory.findMany({
    where: { type: target.type },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const currentIndex = siblings.findIndex(s => s.id === id);
  const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (swapIndex < 0 || swapIndex >= siblings.length) {
    return; // 端にいる場合は何もしない
  }

  // 配列内で要素を入れ替える
  const reordered = [...siblings];
  [reordered[currentIndex], reordered[swapIndex]] = [
    reordered[swapIndex],
    reordered[currentIndex],
  ];

  // 全カテゴリーの sortOrder を連番で再割り当てする
  await prisma.$transaction(
    reordered.map((cat, index) =>
      prisma.mainCategory.update({
        where: { id: cat.id },
        data: { sortOrder: index },
      }),
    ),
  );

  revalidatePath("/settings");
  logger.info(`Reordered category ${id} ${direction}.`);
}

/**
 * サブカテゴリーの表示順序を入れ替える関数である．
 * 同じメインカテゴリー内での上下移動を想定している．
 */
export async function reorderSubCategory(id: string, direction: "up" | "down") {
  logger.info(`Reordering sub category ${id} ${direction}...`);

  const target = await prisma.subCategoryItem.findUnique({ where: { id } });
  if (!target) throw new Error("Sub category not found");

  // 同じメインカテゴリー内のサブカテゴリーを sortOrder 順に取得する
  const siblings = await prisma.subCategoryItem.findMany({
    where: { mainCategoryId: target.mainCategoryId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const currentIndex = siblings.findIndex(s => s.id === id);
  const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (swapIndex < 0 || swapIndex >= siblings.length) {
    return; // 端にいる場合は何もしない
  }

  // 配列内で要素を入れ替える
  const reordered = [...siblings];
  [reordered[currentIndex], reordered[swapIndex]] = [
    reordered[swapIndex],
    reordered[currentIndex],
  ];

  // 全サブカテゴリーの sortOrder を連番で再割り当てする
  await prisma.$transaction(
    reordered.map((cat, index) =>
      prisma.subCategoryItem.update({
        where: { id: cat.id },
        data: { sortOrder: index },
      }),
    ),
  );

  revalidatePath("/settings");
  logger.info(`Reordered sub category ${id} ${direction}.`);
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
  revalidatePath("/settings");
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
  revalidatePath("/settings");
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
 * Transaction の subCategoryId は保持される．
 */
export async function importCategories(data: unknown) {
  const parsed = categoryImportSchema.parse(data);
  logger.info(
    `Importing categories with ${parsed.categories.length} main categories`,
  );

  // 既存データを全削除（Transaction は保持）
  await prisma.$transaction([
    prisma.categoryRule.deleteMany(),
    prisma.subCategoryItem.deleteMany(),
    prisma.mainCategory.deleteMany(),
  ]);

  // 各 type 内の sortOrder をインデックスで計算（DB は空なので自前で管理）
  const typeCounter: Record<string, number> = { INCOME: 0, EXPENSE: 0 };
  const createPromises = parsed.categories.map(mc => {
    const sortOrder = typeCounter[mc.type]++;

    return prisma.mainCategory.create({
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

  // トランザクションで新規作成
  await prisma.$transaction(createPromises);

  revalidatePath("/settings");
  revalidatePath("/transactions");
  logger.info("Categories imported successfully.");
}
