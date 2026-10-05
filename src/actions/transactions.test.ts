// src/actions/transactions.ts の手動振替が，元の明細の符号を保ち，振替先の既存の明細と結ぶことを検証する．
// 入金明細を振替にすると両側が正になって一覧から消え（TX-1），振替先も同期対象だと入金が二重に数えられていた（TX-2）
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

// 本物の logger は pino-pretty の worker を起動するので，テストでは使わない
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/prisma", () => {
  const txClient = {
    transaction: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      create: mocks.create,
      findMany: mocks.findMany,
      deleteMany: mocks.deleteMany,
    },
  };
  return {
    prisma: {
      transaction: { findUnique: mocks.findUnique },
      transferRule: { deleteMany: vi.fn(), create: vi.fn() },
      // 対話型トランザクションはコールバックに txClient を渡し，配列形式はそのまま待つ
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function"
          ? arg(txClient)
          : Promise.all(arg as Promise<unknown>[]),
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

import {
  markTransactionAsTransfer,
  unmarkTransfer,
} from "@/actions/transactions";

const SOURCE_ID = "a".repeat(64);
const TARGET_SUB_ACCOUNT_ID = "sub-target";
const DATE = new Date("2026-09-30T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({
    id: SOURCE_ID,
    date: DATE,
    amount: 5000,
    desc: "給与振込",
    subAccountId: "sub-source",
    isTransfer: false,
  });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("markTransactionAsTransfer", () => {
  it("振替先に相手がなければ，入金明細の逆符号で相手側を作り，元の金額は変えない", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await markTransactionAsTransfer({
      transactionId: SOURCE_ID,
      targetSubAccountId: TARGET_SUB_ACCOUNT_ID,
      createRule: false,
    });

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subAccountId: TARGET_SUB_ACCOUNT_ID,
          date: DATE,
          amount: -5000,
          isTransfer: false,
        },
      }),
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      subAccountId: TARGET_SUB_ACCOUNT_ID,
      amount: -5000,
      linkedTransId: SOURCE_ID,
    });
    // 元の明細はフラグとリンクだけを更新し，金額には触れない
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty("amount");
  });

  it("振替先に同じ日付・逆符号・同額の明細があれば，作らずにそれと結ぶ", async () => {
    const existingId = "b".repeat(64);
    mocks.findFirst.mockResolvedValue({ id: existingId });

    await markTransactionAsTransfer({
      transactionId: SOURCE_ID,
      targetSubAccountId: TARGET_SUB_ACCOUNT_ID,
      createRule: false,
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    const [sourceClaim, targetClaim] = mocks.updateMany.mock.calls.map(
      call => call[0],
    );
    expect(sourceClaim.where).toEqual({ id: SOURCE_ID, isTransfer: false });
    expect(sourceClaim.data.linkedTransId).toBe(existingId);
    expect(targetClaim.where).toEqual({ id: existingId, isTransfer: false });
    expect(targetClaim.data.linkedTransId).toBe(SOURCE_ID);
    expect(targetClaim.data.transferId).toBe(sourceClaim.data.transferId);
  });

  it("結ぼうとした明細が先に別の振替に使われたら失敗し，トランザクションを戻す", async () => {
    mocks.findFirst.mockResolvedValue({ id: "b".repeat(64) });
    mocks.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      markTransactionAsTransfer({
        transactionId: SOURCE_ID,
        targetSubAccountId: TARGET_SUB_ACCOUNT_ID,
        createRule: false,
      }),
    ).rejects.toThrow("別の振替に使われました");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

// 振替を取り消す手段がなかった（TX-3）．アプリが作った明細は消し，同期で取り込んだ明細はフラグだけ戻す
describe("unmarkTransfer", () => {
  const TRANSFER_ID = "tf_aaaaaaaa_1";
  const GENERATED_ID = "123e4567-e89b-42d3-a456-426614174000";

  it("生成した UUID の明細を削除し，同期で取り込んだ明細のフラグとリンクを戻す", async () => {
    mocks.findUnique.mockResolvedValue({ transferId: TRANSFER_ID });
    mocks.findMany.mockResolvedValue([{ id: SOURCE_ID }, { id: GENERATED_ID }]);

    await unmarkTransfer(SOURCE_ID);

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { transferId: TRANSFER_ID } }),
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [GENERATED_ID] } },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [SOURCE_ID] } },
      data: { isTransfer: false, transferId: null, linkedTransId: null },
    });
  });

  it("transferId のない同期の振替は取り消さない", async () => {
    mocks.findUnique.mockResolvedValue({ transferId: null });

    await expect(unmarkTransfer(SOURCE_ID)).rejects.toThrow("取り消せません");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
