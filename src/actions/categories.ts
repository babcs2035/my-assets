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
  console.log("📂 Fetching categories...");
  return prisma.mainCategory.findMany({
    include: {
      subCategories: {
        include: {
          _count: {
            select: { transactions: true, rules: true },
          },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * 新しいメインカテゴリーを作成する関数である．
 */
export async function createMainCategory(input: MainCategoryCreateInput) {
  const data = mainCategoryCreateSchema.parse(input);
  console.log(`➕ Creating main category: ${data.name}`);
  return prisma.mainCategory.create({ data });
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
  return prisma.subCategoryItem.create({ data });
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
  console.log("⚙️ Applying all category rules to unclassified transactions...");
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

  console.log(`✅ Category rules applied to ${applied} transactions.`);
  return { applied };
}
