import { describe, expect, it } from "vitest";
import {
  categoryImportSchema,
  categoryRuleCreateSchema,
  categoryRuleUpdateSchema,
  mainAccountUpdateSchema,
  mainCategoryCreateSchema,
  transferRuleUpdateSchema,
} from "@/lib/validations";

describe("更新用のスキーマ", () => {
  // 空文字のキーワードは contains: "" になり，未分類の明細すべてに当たる (A-2)
  it("カテゴリールールの空のキーワードを弾く", () => {
    expect(categoryRuleUpdateSchema.safeParse({ keyword: "" }).success).toBe(
      false,
    );
  });

  it("振替ルールの空のキーワードを弾く", () => {
    expect(transferRuleUpdateSchema.safeParse({ keyword: "" }).success).toBe(
      false,
    );
  });

  it("メイン口座の空のラベルを弾く", () => {
    expect(mainAccountUpdateSchema.safeParse({ label: "" }).success).toBe(
      false,
    );
  });

  it("項目を省いた部分的な更新は通す", () => {
    expect(categoryRuleUpdateSchema.safeParse({}).success).toBe(true);
    expect(transferRuleUpdateSchema.safeParse({}).success).toBe(true);
    expect(
      mainAccountUpdateSchema.safeParse({ providerId: "provider-1" }).success,
    ).toBe(true);
  });

  it("メイン口座の mfUrlId は null で外せる", () => {
    expect(mainAccountUpdateSchema.safeParse({ mfUrlId: null }).success).toBe(
      true,
    );
  });
});

describe("作成用のスキーマの既定値", () => {
  it("メインカテゴリーの種類を省くと支出になる", () => {
    expect(mainCategoryCreateSchema.parse({ name: "食費" }).type).toBe(
      "EXPENSE",
    );
  });

  it("カテゴリールールの優先度を省くと 0 になる", () => {
    expect(
      categoryRuleCreateSchema.parse({
        keyword: "コンビニ",
        subCategoryId: "s1",
      }).priority,
    ).toBe(0);
  });
});

describe("categoryImportSchema", () => {
  const buildImportData = (keyword: string) => ({
    categories: [
      {
        name: "食費",
        type: "EXPENSE",
        subCategories: [{ name: "外食", rules: [{ keyword, priority: 0 }] }],
      },
    ],
  });

  it("exportedAt がなくても読み込める", () => {
    expect(categoryImportSchema.safeParse(buildImportData("店")).success).toBe(
      true,
    );
  });

  it("空のキーワードを含むデータを弾く", () => {
    expect(categoryImportSchema.safeParse(buildImportData("")).success).toBe(
      false,
    );
  });
});
