// src/actions/dashboard.ts の期限切れ間近のポイントが，JST の今日から 1 か月後の同じ日までを抽出することを検証する．
// 現在の瞬間と比べていたため今日が期限のポイントが JST 09:00 以降に消え，上限が翌月 1 日のため月末は 1〜2 日分しか出なかった（DASH-12）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

// 本物の logger は pino-pretty の worker を起動するので，テストでは使わない
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { pointDetail: { findMany: mocks.findMany } },
}));
// unstable_cache は Next.js の request の外では使えないので，元の関数をそのまま呼ぶ
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
}));

import { getExpiringPoints } from "@/actions/dashboard";

/** findMany に渡された期限日の範囲を ISO 文字列で返す */
function expirationRangeOfQuery() {
  const { gte, lte } = mocks.findMany.mock.calls[0][0].where.expirationDate;
  return { gte: gte.toISOString(), lte: lte.toISOString() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getExpiringPoints", () => {
  it("JST 09:00 を過ぎても，今日が期限のポイントを含める", async () => {
    // JST 2026-10-03 10:00．期限日 2026-10-03 は 2026-10-03T00:00Z で保存されている
    vi.setSystemTime(new Date("2026-10-03T01:00:00Z"));
    await getExpiringPoints();

    expect(expirationRangeOfQuery()).toEqual({
      gte: "2026-10-03T00:00:00.000Z",
      lte: "2026-11-03T00:00:00.000Z",
    });
  });

  it("UTC では前日の JST 00:30 でも，JST の今日を基準にする", async () => {
    // JST 2026-10-03 00:30
    vi.setSystemTime(new Date("2026-10-02T15:30:00Z"));
    await getExpiringPoints();

    expect(expirationRangeOfQuery().gte).toBe("2026-10-03T00:00:00.000Z");
  });

  it("月末でも 1 か月分を抽出し，翌月に同じ日がなければ末日までにする", async () => {
    // JST 2026-10-31 12:00
    vi.setSystemTime(new Date("2026-10-31T03:00:00Z"));
    await getExpiringPoints();

    expect(expirationRangeOfQuery()).toEqual({
      gte: "2026-10-31T00:00:00.000Z",
      lte: "2026-11-30T00:00:00.000Z",
    });
  });
});
