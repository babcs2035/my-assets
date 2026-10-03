import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import {
  filterByUnifiedTimeRange,
  isInUnifiedTimeRange,
} from "@/lib/chart-time-range";

// オフセット付きの文字列を使い，テストを実行する環境のタイムゾーンに左右されないようにする
const NOW = dayjs("2026-10-03T12:00:00+09:00").tz("Asia/Tokyo");

describe("isInUnifiedTimeRange", () => {
  it("1W は 7 日前の日の 00:00 JST から含める", () => {
    expect(isInUnifiedTimeRange("2026-09-26T00:00:00+09:00", "1W", NOW)).toBe(
      true,
    );
    expect(isInUnifiedTimeRange("2026-09-25T23:59:59+09:00", "1W", NOW)).toBe(
      false,
    );
  });

  it("日付の境界は UTC ではなく JST で判定する", () => {
    // 2026-09-25T15:00Z は JST では 2026-09-26 00:00 である
    expect(isInUnifiedTimeRange("2026-09-25T15:00:00Z", "1W", NOW)).toBe(true);
    expect(isInUnifiedTimeRange("2026-09-25T14:59:59Z", "1W", NOW)).toBe(false);
  });

  it("1M は 1 カ月前の同じ日から含める", () => {
    expect(isInUnifiedTimeRange("2026-09-03T00:00:00+09:00", "1M", NOW)).toBe(
      true,
    );
    expect(isInUnifiedTimeRange("2026-09-02T23:00:00+09:00", "1M", NOW)).toBe(
      false,
    );
  });

  it("ALL はすべての日付を含める", () => {
    expect(isInUnifiedTimeRange("2000-01-01T00:00:00+09:00", "ALL", NOW)).toBe(
      true,
    );
  });

  it("解釈できない日付は含めない", () => {
    expect(isInUnifiedTimeRange("not-a-date", "1M", NOW)).toBe(false);
    expect(isInUnifiedTimeRange("not-a-date", "ALL", NOW)).toBe(false);
  });
});

describe("filterByUnifiedTimeRange", () => {
  const data = [
    { date: "2026-09-20T00:00:00+09:00", value: 1 },
    { date: "2026-09-30T00:00:00+09:00", value: 2 },
    { date: "2026-10-03T00:00:00+09:00", value: 3 },
  ];

  it("範囲内の要素だけを順序を保って返す", () => {
    expect(
      filterByUnifiedTimeRange(data, "1W", d => d.date, NOW).map(d => d.value),
    ).toEqual([2, 3]);
  });

  it("ALL は同じ配列をそのまま返す", () => {
    expect(filterByUnifiedTimeRange(data, "ALL", d => d.date, NOW)).toBe(data);
  });
});
