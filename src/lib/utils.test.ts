import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatJSTDate,
  formatJSTDateTime,
  formatPercent,
  formatSignedAmount,
  formatSignedCurrency,
  nowJST,
  parseJSTDate,
  todayJST,
  toUtcDateOnly,
  yesterdayJST,
} from "@/lib/utils";

describe("toUtcDateOnly", () => {
  it("その日付の UTC 00:00 を返す", () => {
    expect(toUtcDateOnly(2026, 10, 3).toISOString()).toBe(
      "2026-10-03T00:00:00.000Z",
    );
  });

  it("月の範囲を超えた日は翌月に繰り上がる", () => {
    // 月末の翌日をクエリの上限に使うため，繰り上がりに依存している
    expect(toUtcDateOnly(2026, 12, 32).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("parseJSTDate", () => {
  it("JST 00:00 の瞬間（前日 15:00Z）を返す", () => {
    expect(parseJSTDate("2026-10-03").toISOString()).toBe(
      "2026-10-02T15:00:00.000Z",
    );
  });
});

describe("formatJSTDate", () => {
  it("UTC では前日でも，JST の日付を返す", () => {
    expect(formatJSTDate(new Date("2026-10-02T15:00:00Z"))).toBe("2026-10-03");
    expect(formatJSTDate(new Date("2026-10-02T14:59:59Z"))).toBe("2026-10-02");
  });

  it("JST 08:00 に保存した残高履歴を，その日の日付にする", () => {
    // toISOString().slice(0, 10) だと 2026-10-02 になり，前日比が 0 になった (A-1)
    expect(formatJSTDate(new Date("2026-10-02T23:00:00Z"))).toBe("2026-10-03");
  });

  it("parseJSTDate の結果を元の文字列に戻す", () => {
    expect(formatJSTDate(parseJSTDate("2026-01-01"))).toBe("2026-01-01");
  });
});

describe("現在時刻から JST の日付を求める関数", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("UTC では前日の JST 00:30 に，JST の今日と昨日を返す", () => {
    vi.setSystemTime(new Date("2026-10-02T15:30:00Z"));
    expect(todayJST().toISOString()).toBe("2026-10-02T15:00:00.000Z");
    expect(yesterdayJST().toISOString()).toBe("2026-10-01T15:00:00.000Z");
    expect(formatJSTDate(todayJST())).toBe("2026-10-03");
  });

  it("月初の昨日は前月の末日になる", () => {
    vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
    expect(formatJSTDate(yesterdayJST())).toBe("2026-09-30");
  });

  it("nowJST は 9 時間ずらさず，現在の瞬間を秒単位で返す", () => {
    vi.setSystemTime(new Date("2026-10-02T15:30:45.678Z"));
    expect(nowJST().toISOString()).toBe("2026-10-02T15:30:45.000Z");
    expect(formatJSTDate(nowJST())).toBe("2026-10-03");
  });
});

describe("formatJSTDateTime", () => {
  it("JST の日時を YYYY/MM/DD HH:MM で返す", () => {
    expect(formatJSTDateTime("2026-10-02T15:05:00Z")).toBe("2026/10/03 00:05");
    expect(formatJSTDateTime(new Date("2026-10-03T04:30:00Z"))).toBe(
      "2026/10/03 13:30",
    );
  });

  it("null には — を返す", () => {
    expect(formatJSTDateTime(null)).toBe("—");
  });
});

describe("符号付きの数値の整形", () => {
  it("formatSignedCurrency は負の金額の記号を ¥ の前に置く", () => {
    expect(formatSignedCurrency(-1234)).toBe("-¥1,234");
    expect(formatSignedCurrency(1234)).toBe("¥1,234");
  });

  it("formatSignedAmount は 0 以上に + を付ける", () => {
    expect(formatSignedAmount(0)).toBe("+0");
    expect(formatSignedAmount(-1500)).toBe("-1,500");
  });

  it("formatPercent は比率を百分率にする", () => {
    expect(formatPercent(0.05)).toBe("+5.00%");
    expect(formatPercent(-0.0123)).toBe("-1.23%");
  });
});
