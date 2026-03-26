"use server";

import { prisma } from "@/lib/prisma";
import {
  type CategoryRuleCreateInput,
  categoryRuleCreateSchema,
  type MainCategoryCreateInput,
  mainCategoryCreateSchema,
  type SubCategoryCreateInput,
  subCategoryCreateSchema,
} from "@/lib/validations";

/**
 * すべてのメインカテゴリーおよびサブカテゴリーの情報を取得する関数である．
 * 各サブカテゴリーに紐付く取引数やルールの数も併せて取得する．
 */
export async function getCategories() {
  console.log("Fetching categories...");
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
  console.log(`Creating main category: ${data.name}`);

  // 同じタイプの最大 sortOrder を取得し，末尾に追加する
  const maxOrder = await prisma.mainCategory.aggregate({
    where: { type: data.type },
    _max: { sortOrder: true },
  });
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  return prisma.mainCategory.create({
    data: {
      ...data,
      sortOrder: nextOrder,
    },
  });
}

/**
 * メインカテゴリーを削除する関数である．
 */
export async function deleteMainCategory(id: string) {
  console.log(`🗑️ Deleting main category: ${id}`);
  return prisma.mainCategory.delete({
    where: { id },
  });
}

/**
 * 新しいサブカテゴリーを作成する関数である．
 */
export async function createSubCategory(input: SubCategoryCreateInput) {
  const data = subCategoryCreateSchema.parse(input);
  console.log(`➕ Creating sub category: ${data.name}`);

  // 同じメインカテゴリー内の最大 sortOrder を取得し，末尾に追加する
  const maxOrder = await prisma.subCategoryItem.aggregate({
    where: { mainCategoryId: data.mainCategoryId },
    _max: { sortOrder: true },
  });
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  return prisma.subCategoryItem.create({
    data: {
      ...data,
      sortOrder: nextOrder,
    },
  });
}

/**
 * サブカテゴリーを削除する関数である．
 */
export async function deleteSubCategory(id: string) {
  console.log(`🗑️ Deleting sub category: ${id}`);
  return prisma.subCategoryItem.delete({
    where: { id },
  });
}

/**
 * すべてのカテゴリールールを取得する関数である．
 * ルールには適用優先順位 (priority) があり，降順で取得する．
 */
export async function getCategoryRules() {
  console.log("📜 Fetching category rules...");
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
  console.log(`➕ Creating category rule for keyword: ${data.keyword}`);

  // 同じキーワードを持つ既存のルールを削除してから新規作成する
  await prisma.categoryRule.deleteMany({
    where: { keyword: data.keyword },
  });

  return prisma.categoryRule.create({ data });
}

/**
 * カテゴリールールを更新する関数である．
 */
export async function updateCategoryRule(
  id: string,
  data: { keyword?: string; priority?: number; subCategoryId?: string },
) {
  console.log(`📝 Updating category rule: ${id}`);
  return prisma.categoryRule.update({
    where: { id },
    data,
  });
}

/**
 * カテゴリールールを削除する関数である．
 */
export async function deleteCategoryRule(id: string) {
  console.log(`🗑️ Deleting category rule: ${id}`);
  return prisma.categoryRule.delete({
    where: { id },
  });
}

/**
 * 定義されたすべてのカテゴリールールを，未分類の取引に対して一括適用する関数である．
 * 優先順位の高いルールから順に適用され，適用された取引の総数を返す．
 */
export async function applyAllCategoryRules() {
  console.log("Applying all category rules to unclassified transactions...");
  const rules = await prisma.categoryRule.findMany({
    orderBy: { priority: "desc" },
  });

  let applied = 0;

  for (const rule of rules) {
    const result = await prisma.transaction.updateMany({
      where: {
        desc: { contains: rule.keyword },
        subCategoryId: null,
      },
      data: {
        subCategoryId: rule.subCategoryId,
      },
    });
    applied += result.count;
  }

  console.log(`Category rules applied to ${applied} transactions.`);
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
  console.log(`Reordering category ${id} ${direction}...`);

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

  console.log(`Reordered category ${id} ${direction}.`);
}

/**
 * サブカテゴリーの表示順序を入れ替える関数である．
 * 同じメインカテゴリー内での上下移動を想定している．
 */
export async function reorderSubCategory(id: string, direction: "up" | "down") {
  console.log(`Reordering sub category ${id} ${direction}...`);

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

  console.log(`Reordered sub category ${id} ${direction}.`);
}
