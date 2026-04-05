import dayjs, { type Dayjs } from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// dayjs に UTC とタイムゾーンプラグインを追加
dayjs.extend(utc);
dayjs.extend(timezone);

// デフォルトのタイムゾーンを JST に設定
dayjs.tz.setDefault("Asia/Tokyo");

export type UnifiedTimeRange = "1W" | "1M" | "3M" | "1Y" | "ALL";

export const UNIFIED_TIME_RANGE_OPTIONS: ReadonlyArray<{
  value: UnifiedTimeRange;
  label: string;
}> = [
  { value: "1W", label: "1週間" },
  { value: "1M", label: "1カ月" },
  { value: "3M", label: "3カ月" },
  { value: "1Y", label: "1年" },
  { value: "ALL", label: "全期間" },
];

function getRangeStart(range: UnifiedTimeRange, now: Dayjs): Dayjs | null {
  if (range === "ALL") return null;
  if (range === "1W") return now.subtract(7, "day");
  if (range === "1M") return now.subtract(1, "month");
  if (range === "3M") return now.subtract(3, "month");
  return now.subtract(1, "year");
}

export function isInUnifiedTimeRange(
  date: string | Date,
  range: UnifiedTimeRange,
  now = dayjs().tz("Asia/Tokyo"),
): boolean {
  const target = dayjs(date).tz("Asia/Tokyo");
  if (!target.isValid()) return false;

  const start = getRangeStart(range, now);
  if (!start) return true;
  return target.isAfter(start) || target.isSame(start, "day");
}

export function filterByUnifiedTimeRange<T>(
  data: T[],
  range: UnifiedTimeRange,
  getDate: (item: T) => string | Date,
  now = dayjs().tz("Asia/Tokyo"),
): T[] {
  if (range === "ALL") return data;
  return data.filter(item => isInUnifiedTimeRange(getDate(item), range, now));
}
