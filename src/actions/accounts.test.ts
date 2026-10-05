// src/actions/accounts.ts の口座一覧が，今日以降のカード請求を子口座ごとに 1 件へ絞らずに返すことを検証する．
// 最も先の請求だけを残していたため，翌月分があるカードでは今月分が「今月合計」から落ちていた（ACC-3）
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccounts: vi.fn(),
  findBillings: vi.fn(),
}));

// 本物の logger は pino-pretty の worker を起動するので，テストでは使わない
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mainAccount: { findMany: mocks.findAccounts },
    creditCardBilling: { findMany: mocks.findBillings },
  },
}));
// revalidatePath は request の外では呼べないので，呼ばれないようにする
vi.mock("@/lib/revalidate", () => ({
  revalidateAccountAndDashboardPages: vi.fn(),
  revalidateAccountDetailPage: vi.fn(),
  revalidateAccountsPage: vi.fn(),
  revalidateTransactionsPage: vi.fn(),
}));

import { getAccountList } from "@/actions/accounts";

const CARD_ACCOUNT_ID = "main-card";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAccounts.mockResolvedValue([
    {
      id: CARD_ACCOUNT_ID,
      label: "カード会社",
      sortOrder: 0,
      provider: { name: "MoneyForward" },
      subAccounts: [
        {
          id: "sub-card",
          currentName: "カード A",
          balance: -50000,
          assetType: "LIABILITY",
          mainAccountId: CARD_ACCOUNT_ID,
          sortOrder: 0,
        },
      ],
    },
  ]);
});

describe("getAccountList", () => {
  it("同じ子口座に今月分と翌月分の請求があれば，両方を返す", async () => {
    const thisMonth = new Date("2026-10-27T00:00:00Z");
    const nextMonth = new Date("2026-11-27T00:00:00Z");
    const card = { currentName: "カード A", mainAccountId: CARD_ACCOUNT_ID };
    mocks.findBillings.mockResolvedValue([
      { amount: 30000, billingDate: thisMonth, subAccount: card },
      { amount: 20000, billingDate: nextMonth, subAccount: card },
    ]);

    const [account] = await getAccountList();

    expect(account.billingSummary).toEqual({
      totalBilling: 50000,
      recentBillings: [
        { subAccountName: "カード A", amount: 30000, billingDate: thisMonth },
        { subAccountName: "カード A", amount: 20000, billingDate: nextMonth },
      ],
    });
    // 近い請求から並べるため，請求日の昇順で取得する
    expect(mocks.findBillings.mock.calls[0][0].orderBy).toEqual({
      billingDate: "asc",
    });
  });

  it("請求がない口座の billingSummary は null にする", async () => {
    mocks.findBillings.mockResolvedValue([]);

    const [account] = await getAccountList();

    expect(account.billingSummary).toBeNull();
  });
});
