import { describe, expect, it } from "vitest";
import { formatYAxisCurrency, getNiceChartDomain } from "@/lib/chart-format";

describe("formatYAxisCurrency", () => {
  it("1 億以上は億で表し，小数第 1 位までにする", () => {
    expect(formatYAxisCurrency(100_000_000)).toBe("¥1億");
    expect(formatYAxisCurrency(123_456_789)).toBe("¥1.2億");
  });

  it("1 万以上は万で表す", () => {
    expect(formatYAxisCurrency(10_000)).toBe("¥1万");
    expect(formatYAxisCurrency(15_000)).toBe("¥1.5万");
  });

  it("負の値も絶対値で単位を決める", () => {
    expect(formatYAxisCurrency(-25_000)).toBe("¥-2.5万");
  });

  it("1 万未満はカンマ区切りの整数にする", () => {
    expect(formatYAxisCurrency(9_999)).toBe("¥9,999");
    expect(formatYAxisCurrency(12.6)).toBe("¥13");
  });
});

describe("getNiceChartDomain", () => {
  it("値がなければ [0, 1] を返す", () => {
    expect(getNiceChartDomain([])).toEqual([0, 1]);
  });

  it("すべて同じ値なら，その値の 5%（最小 1）の幅を上下に取る", () => {
    expect(getNiceChartDomain([0, 0])).toEqual([-1, 1]);
    expect(getNiceChartDomain([100, 100])).toEqual([95, 105]);
  });

  it("範囲の 8%（最小 1）の余白を上下に取る", () => {
    expect(getNiceChartDomain([0, 100])).toEqual([-8, 108]);
    expect(getNiceChartDomain([0, 5])).toEqual([-1, 6]);
  });
});
