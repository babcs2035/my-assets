export function formatYAxisCurrency(value: number): string {
  const abs = Math.abs(value);

  const withTrimmedDecimal = (num: number) =>
    num.toFixed(1).replace(/\.0$/, "");

  if (abs >= 100000000) {
    return `¥${withTrimmedDecimal(value / 100000000)}億`;
  }

  if (abs >= 10000) {
    return `¥${withTrimmedDecimal(value / 10000)}万`;
  }

  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
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
