import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * JST の時刻要素を UTC 値を持つ Date に変換するヘルパーである．
 * `Date.UTC(year, month-1, day, hour-9, minute, second)` を計算し，
 * JST の (y,M,d,h,m,s) が表す瞬間の UTC 値を持つ Date を返す．
 */
function jstToUTCDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
}

/**
 * JST の日付要素 (y,M,d,0,0,0) を，その瞬間の UTC 値を持つ Date に変換する．
 * JST 00:00 = UTC 前日 15:00 になるため，`hour-9` で自動的に日付がロールバックされる．
 */
function jstDateToUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
}

/**
 * 日本標準時 (JST) での現在時刻を取得する関数である．
 * サーバーのタイムゾーンに依存せず，常に JST を返す．
 * 内部の UTC 値は，「現在の JST 時刻に対応する UTC 時刻」になる．
 */
export function nowJST(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find(p => p.type === type)?.value ?? "0", 10);
  return jstToUTCDate(
    get("year"),
    get("month"),
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/**
 * JST の今日の日付を 00:00:00 にリセットした Date を返す関数である．
 * 内部の UTC 値は，「今日 JST 00:00 に対応する UTC 時刻」になる．
 */
export function todayJST(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find(p => p.type === type)?.value ?? "0", 10);
  return jstDateToUTC(get("year"), get("month"), get("day"));
}

/**
 * JST の昨日の日付を 00:00:00 にリセットした Date を返す関数である．
 */
export function yesterdayJST(): Date {
  const jst = todayJST();
  jst.setUTCDate(jst.getUTCDate() - 1);
  return jst;
}

/**
 * YYYY-MM-DD 形式の文字列を JST の Date オブジェクトに変換する関数である．
 * 時刻は 00:00:00 JST となる．
 */
export function parseJSTDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return jstDateToUTC(year, month, day);
}

/**
 * Date オブジェクトを JST の YYYY-MM-DD 形式の文字列に変換する関数である．
 * `Intl.DateTimeFormat` で JST の日付を直接取得するため，
 * サーバーのタイムゾーンに依存しない．
 */
export function formatJSTDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Date オブジェクトを JST の YYYY/MM/DD HH:MM 形式の文字列に変換する関数である．
 */
export function formatJSTDateTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });
  const parts = formatter.formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * Tailwind CSS のクラス名を結合するためのユーティリティ関数である．
 * clsx でクラス名の条件付き結合を行い，twMerge で重複するクラスを統合する．
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 金額をフォーマットする関数である．
 * 単位付きの円表記（例: ¥1,234,567）を返す．
 */
export function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

/**
 * 金額をフォーマットする関数である．
 * 符号付きの円表記（例: ¥-1,234）を返す．
 */
export function formatSignedCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}¥${Math.abs(amount).toLocaleString("ja-JP")}`;
}

/**
 * 数値に対して正負の記号 (+ / -) を付け，カンマ区切りの文字列に変換する関数である．
 */
export function formatSignedAmount(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("ja-JP").format(amount)}`;
}

/**
 * 数値をパーセント表記 (例: +5.00%) に変換する関数である．
 * 小数第 2 位まで表示し，正の数の場合は + 記号を付与する．
 */
export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

/**
 * 資産タイプ (AssetType) に対応する日本語の表示名を返す関数である．
 */
export function assetTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    CASH: "預金・現金",
    INVESTMENT: "投資信託・証券",
    CRYPTO: "暗号資産",
    POINT: "ポイント",
    LIABILITY: "負債",
  };
  return labels[type] ?? type;
}

/**
 * 資産タイプ (AssetType) に対応するカラーコードを返す関数である．
 * グラフなどの UI 要素での色分けに使用することを想定している．
 */
export function assetTypeColor(type: string): string {
  const colors: Record<string, string> = {
    CASH: "#3b82f6", // Blue
    INVESTMENT: "#8b5cf6", // Violet
    CRYPTO: "#f59e0b", // Amber
    POINT: "#10b981", // Emerald
    LIABILITY: "#ef4444", // Red
  };
  return colors[type] ?? "#94a3b8";
}

/**
 * @deprecated formatJSTDate を使用してください．
 */
export function formatDisplayDate(date: Date): string {
  return formatJSTDate(date);
}
