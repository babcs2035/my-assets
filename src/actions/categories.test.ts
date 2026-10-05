// src/actions/categories.ts のインポートが，作り直したカテゴリーへ明細の分類を付け直すことを検証する．
// 以前はインポートで明細の分類がすべて外れ，エクスポートにも含まれないので戻せなかった（SET-5）
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subCategoryFindMany: vi.fn(),
  transactionUpdateMany: vi.fn(),
  mainCategoryCreate: vi.fn(),
}));

// 本物の logger は pino-pretty の worker を起動するので，テストでは使わない
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/prisma", () => {
  const txClient = {
    transaction: { updateMany: mocks.transactionUpdateMany },
    categoryRule: { deleteMany: vi.fn() },
    subCategoryItem: {
      findMany: mocks.subCategoryFindMany,
      deleteMany: vi.fn(),
    },
    mainCategory: { deleteMany: vi.fn(), create: mocks.mainCategoryCreate },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(txClient),
      ),
    },
  };
});
// revalidatePath は request の外では呼べないので，呼ばれないようにする
vi.mock("@/lib/revalidate", () => ({
  revalidateSettingsAndTransactionPages: vi.fn(),
  revalidateSettingsPage: vi.fn(),
  revalidateTransactionsPage: vi.fn(),
}));

import { importCategories } from "@/actions/categories";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transactionUpdateMany.mockResolvedValue({ count: 0 });
  mocks.mainCategoryCreate.mockResolvedValue({});
});

describe("importCategories", () => {
  it("種別・メイン・サブの名前が同じサブカテゴリーへ明細の分類を付け直し，ないものは未分類のままにする", async () => {
    mocks.subCategoryFindMany
      // 削除前のサブカテゴリーと，それに分類されていた明細
      .mockResolvedValueOnce([
        {
          name: "外食",
          mainCategory: { name: "食費", type: "EXPENSE" },
          transactions: [{ id: "tx-1" }, { id: "tx-2" }],
        },
        {
          name: "雑誌",
          mainCategory: { name: "教養", type: "EXPENSE" },
          transactions: [{ id: "tx-3" }],
        },
      ])
      // インポートで作り直したサブカテゴリー（雑誌はファイルにない）
      .mockResolvedValueOnce([
        {
          id: "new-dining",
          name: "外食",
          mainCategory: { name: "食費", type: "EXPENSE" },
        },
      ]);

    await importCategories({
      categories: [
        {
          name: "食費",
          type: "EXPENSE",
          subCategories: [{ name: "外食", rules: [] }],
        },
      ],
    });

    // 1 回目は削除前の分類の解除，2 回目が付け直しで，ファイルにない「雑誌」は付け直さない
    expect(mocks.transactionUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.transactionUpdateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["tx-1", "tx-2"] } },
      data: { subCategoryId: "new-dining" },
    });
  });
});
