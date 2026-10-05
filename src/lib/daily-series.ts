/**
 * 開始日から終了日までの日付（YYYY-MM-DD）を 1 日ずつ並べる関数である．
 * 文字列を UTC の日付として進めるので，実行環境のタイムゾーンや夏時間に左右されない．
 */
export function listDateKeysBetween(
  startKey: string,
  endKey: string,
): string[] {
  const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
  const [endYear, endMonth, endDay] = endKey.split("-").map(Number);
  const end = Date.UTC(endYear, endMonth - 1, endDay);

  const keys: string[] = [];
  for (
    let time = Date.UTC(startYear, startMonth - 1, startDay);
    time <= end;
    time += 24 * 60 * 60 * 1000
  ) {
    keys.push(new Date(time).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * 系列（口座や銘柄）ごとに，記録のない日を直前の記録の値で埋める関数である．
 * 一部の系列だけ記録が欠けた日に，その系列が 0 として合計されて総額が落ち込むのを防ぐ．
 * 最初の記録より前の日は埋めない（後から追加した系列を過去に遡って足さないため）．
 * dateKeys より前の記録は，最初の日の値として引き継ぐ．
 * 戻り値は dateKeys と同じ順で，その日に値を持つ系列のキーと値を返す．
 */
export function forwardFillByDate<T>(
  points: ReadonlyArray<{ seriesKey: string; dateKey: string; value: T }>,
  dateKeys: readonly string[],
): Array<{ dateKey: string; values: Map<string, T> }> {
  const sortedPoints = [...points].sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey),
  );
  const latestBySeries = new Map<string, T>();
  const filled: Array<{ dateKey: string; values: Map<string, T> }> = [];

  let pointIndex = 0;
  for (const dateKey of dateKeys) {
    while (
      pointIndex < sortedPoints.length &&
      sortedPoints[pointIndex].dateKey <= dateKey
    ) {
      const point = sortedPoints[pointIndex];
      latestBySeries.set(point.seriesKey, point.value);
      pointIndex++;
    }
    filled.push({ dateKey, values: new Map(latestBySeries) });
  }
  return filled;
}
