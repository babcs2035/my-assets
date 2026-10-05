import { describe, expect, it } from "vitest";
import { forwardFillByDate, listDateKeysBetween } from "@/lib/daily-series";

describe("listDateKeysBetween", () => {
  it("月末とうるう日をまたいで 1 日ずつ並べる", () => {
    expect(listDateKeysBetween("2028-02-27", "2028-03-01")).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("開始日と終了日が同じなら 1 日だけ返す", () => {
    expect(listDateKeysBetween("2026-10-03", "2026-10-03")).toEqual([
      "2026-10-03",
    ]);
  });

  it("開始日が終了日より後なら空の配列を返す", () => {
    expect(listDateKeysBetween("2026-10-04", "2026-10-03")).toEqual([]);
  });
});

describe("forwardFillByDate", () => {
  const toObject = (values: Map<string, number>) => Object.fromEntries(values);

  it("記録のない日を直前の値で埋める", () => {
    const filled = forwardFillByDate(
      [
        { seriesKey: "a", dateKey: "2026-10-01", value: 100 },
        { seriesKey: "b", dateKey: "2026-10-01", value: 10 },
        // b だけ 10/02 の記録が欠けている
        { seriesKey: "a", dateKey: "2026-10-02", value: 120 },
      ],
      ["2026-10-01", "2026-10-02", "2026-10-03"],
    );

    expect(filled.map(d => d.dateKey)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(toObject(filled[1].values)).toEqual({ a: 120, b: 10 });
    expect(toObject(filled[2].values)).toEqual({ a: 120, b: 10 });
  });

  it("最初の記録より前の日には値を入れない", () => {
    const filled = forwardFillByDate(
      [
        { seriesKey: "a", dateKey: "2026-10-01", value: 100 },
        { seriesKey: "b", dateKey: "2026-10-02", value: 10 },
      ],
      ["2026-10-01", "2026-10-02"],
    );

    expect(toObject(filled[0].values)).toEqual({ a: 100 });
    expect(toObject(filled[1].values)).toEqual({ a: 100, b: 10 });
  });

  it("範囲より前の記録を最初の日に引き継ぎ，入力の順序に依存しない", () => {
    const filled = forwardFillByDate(
      [
        { seriesKey: "a", dateKey: "2026-10-03", value: 300 },
        { seriesKey: "a", dateKey: "2026-09-30", value: 90 },
      ],
      ["2026-10-02", "2026-10-03"],
    );

    expect(toObject(filled[0].values)).toEqual({ a: 90 });
    expect(toObject(filled[1].values)).toEqual({ a: 300 });
  });

  it("日ごとに別の Map を返し，後の日の値で前の日が書き換わらない", () => {
    const filled = forwardFillByDate(
      [
        { seriesKey: "a", dateKey: "2026-10-01", value: 1 },
        { seriesKey: "a", dateKey: "2026-10-02", value: 2 },
      ],
      ["2026-10-01", "2026-10-02"],
    );

    expect(filled[0].values.get("a")).toBe(1);
    expect(filled[1].values.get("a")).toBe(2);
  });
});
