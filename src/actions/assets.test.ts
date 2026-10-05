// src/actions/assets.ts の今月の収支で，前月の集計期間が「前月 1 日〜前月の同じ日」になることを検証する．
// 前月 1 か月分と比べていたため，月初の前月比が毎月大きなマイナスになっていた（DASH-1）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
}));

// 本物の logger は pino-pretty の worker を起動するので，テストでは使わない
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { transaction: { aggregate: mocks.aggregate } },
}));

import { getCurrentMonthIncomeExpense } from "@/actions/assets";

/** aggregate の n 回目の呼び出しに渡された日付の範囲を ISO 文字列で返す */
function dateRangeOfAggregateCall(n: number) {
  const { gte, lt } = mocks.aggregate.mock.calls[n][0].where.date;
  return { gte: gte.toISOString(), lt: lt.toISOString() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getCurrentMonthIncomeExpense", () => {
  it("UTC では前日の JST 00:30 でも，JST の今日を基準に今月と前月同期を集計する", async () => {
    // JST 2026-10-03 00:30
    vi.setSystemTime(new Date("2026-10-02T15:30:00Z"));
    await getCurrentMonthIncomeExpense();

    // 呼び出し順は 今月の収入，今月の支出，前月の収入，前月の支出
    expect(dateRangeOfAggregateCall(0)).toEqual({
      gte: "2026-10-01T00:00:00.000Z",
      lt: "2026-11-01T00:00:00.000Z",
    });
    expect(dateRangeOfAggregateCall(2)).toEqual({
      gte: "2026-09-01T00:00:00.000Z",
      lt: "2026-09-04T00:00:00.000Z",
    });
    expect(dateRangeOfAggregateCall(3)).toEqual(dateRangeOfAggregateCall(2));
  });

  it("前月に同じ日がなければ，前月の末日までを集計する", async () => {
    // JST 2026-03-31 12:00
    vi.setSystemTime(new Date("2026-03-31T03:00:00Z"));
    await getCurrentMonthIncomeExpense();

    expect(dateRangeOfAggregateCall(2)).toEqual({
      gte: "2026-02-01T00:00:00.000Z",
      lt: "2026-03-01T00:00:00.000Z",
    });
  });

  it("1 月は前年の 12 月と比べる", async () => {
    // JST 2027-01-15 12:00
    vi.setSystemTime(new Date("2027-01-15T03:00:00Z"));
    await getCurrentMonthIncomeExpense();

    expect(dateRangeOfAggregateCall(2)).toEqual({
      gte: "2026-12-01T00:00:00.000Z",
      lt: "2026-12-16T00:00:00.000Z",
    });
  });
});
