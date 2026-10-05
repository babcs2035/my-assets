export function formatYAxisCurrency(value: number): string {
  const abs = Math.abs(value);
  // 負の記号は formatCurrency と同じく ¥ の前に置く
  const sign = value < 0 ? "-" : "";

  const withTrimmedDecimal = (num: number) =>
    num.toFixed(1).replace(/\.0$/, "");

  // 単位は丸めた後の値で決める．丸める前で決めると 99,999,999 が「¥10000万」，
  // 9,999.5 が「¥10,000」になり，上の単位に繰り上がらない
  if (Number((abs / 10000).toFixed(1)) >= 10000) {
    return `${sign}¥${withTrimmedDecimal(abs / 100000000)}億`;
  }

  if (Math.round(abs) >= 10000) {
    return `${sign}¥${withTrimmedDecimal(abs / 10000)}万`;
  }

  return `${sign}¥${Math.round(abs).toLocaleString("ja-JP")}`;
}

export function getNiceChartDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const base = min === 0 ? 1 : Math.max(Math.abs(min) * 0.05, 1);
    return [min - base, max + base];
  }

  const range = max - min;
  const padding = Math.max(range * 0.08, 1);
  return [min - padding, max + padding];
}

/**
 * min から max までを覆う Y 軸の目盛りを，1・2・5×10ⁿ の刻みで返す関数である．
 * recharts 3 は domain を固定すると下限から刻んで上限を足すため，下限が半端な値だと
 * 目盛りがすべて半端になる（¥-29.1万 など）．両端も刻みの倍数に広げ，ticks として渡す (DASH-2)
 */
export function getNiceAxisTicks(
  min: number,
  max: number,
  targetCount = 6,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return [min, max];
  }

  const rawStep = (max - min) / Math.max(targetCount - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  // 切り上げると 5.2 が 10 になって刻みが倍になり余白が増えるため，D3 の ticks と同じく
  // 1・2・5・10 の幾何平均（√2，√10，√50）を境に最も近い値へ丸める
  const niceFactor =
    normalized >= Math.sqrt(50)
      ? 10
      : normalized >= Math.sqrt(10)
        ? 5
        : normalized >= Math.sqrt(2)
          ? 2
          : 1;
  const step = niceFactor * magnitude;

  const ticks: number[] = [];
  for (
    let index = Math.floor(min / step);
    index <= Math.ceil(max / step);
    index++
  ) {
    // 小数の刻みで 0.30000000000000004 のような誤差が出ないよう，有効桁で丸める（-0 も 0 になる）
    ticks.push(Number((index * step).toPrecision(12)));
  }
  return ticks;
}
