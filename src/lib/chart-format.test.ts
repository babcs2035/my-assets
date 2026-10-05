import { describe, expect, it } from "vitest";
import {
  formatYAxisCurrency,
  getNiceAxisTicks,
  getNiceChartDomain,
} from "@/lib/chart-format";

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
    expect(formatYAxisCurrency(-25_000)).toBe("-¥2.5万");
    expect(formatYAxisCurrency(-1_500)).toBe("-¥1,500");
  });

  it("1 万未満はカンマ区切りの整数にする", () => {
    expect(formatYAxisCurrency(9_999)).toBe("¥9,999");
    expect(formatYAxisCurrency(12.6)).toBe("¥13");
  });

  it("丸めて上の単位に届く値は，上の単位で表す", () => {
    expect(formatYAxisCurrency(99_999_999)).toBe("¥1億");
    expect(formatYAxisCurrency(99_999_500)).toBe("¥1億");
    expect(formatYAxisCurrency(99_994_999)).toBe("¥9999.5万");
    expect(formatYAxisCurrency(-99_999_999)).toBe("-¥1億");
    expect(formatYAxisCurrency(9_999.5)).toBe("¥1万");
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

  it("NaN や Infinity は範囲の計算から外す", () => {
    expect(getNiceChartDomain([0, Number.NaN, 100])).toEqual([-8, 108]);
    expect(getNiceChartDomain([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([
      0, 1,
    ]);
  });
});

describe("getNiceAxisTicks", () => {
  it("半端な下限でも 1・2・5×10ⁿ の倍数の目盛りにし，0 を含める", () => {
    expect(getNiceAxisTicks(-291_234, 1_320_000)).toEqual([
      -500_000, 0, 500_000, 1_000_000, 1_500_000,
    ]);
  });

  it("両端を刻みの倍数に広げて min と max を覆う", () => {
    expect(getNiceAxisTicks(0, 95)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(getNiceAxisTicks(3, 108)).toEqual([0, 20, 40, 60, 80, 100, 120]);
  });

  it("小数の刻みでも浮動小数点の誤差を出さない", () => {
    expect(getNiceAxisTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("範囲が作れないときは入力をそのまま返す", () => {
    expect(getNiceAxisTicks(5, 5)).toEqual([5, 5]);
    expect(getNiceAxisTicks(Number.NaN, 1)).toEqual([Number.NaN, 1]);
  });
});
