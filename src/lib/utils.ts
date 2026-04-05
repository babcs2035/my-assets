import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 日本標準時 (JST) のオフセット（ミリ秒）．UTC+9 時間．
 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 日本標準時 (JST) での現在時刻を取得する関数である．
 * サーバーのタイムゾーンに依存せず，常に JST を返す．
 */
export function nowJST(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utc + JST_OFFSET_MS);
}

/**
 * 任意の Date オブジェクトを JST として解釈した Date を返す関数である．
 * 引数の Date が表すローカル時刻を JST の時刻として扱う．
 */
export function toJST(date: Date): Date {
  const utc = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  return new Date(utc + JST_OFFSET_MS);
}

/**
 * JST の今日の日付を 00:00:00 にリセットした Date を返す関数である．
 */
export function todayJST(): Date {
  const jst = nowJST();
  jst.setHours(0, 0, 0, 0);
  return jst;
}

/**
 * JST の昨日の日付を 00:00:00 にリセットした Date を返す関数である．
 */
export function yesterdayJST(): Date {
  const jst = todayJST();
  jst.setDate(jst.getDate() - 1);
  return jst;
}

/**
 * YYYY-MM-DD 形式の文字列を JST の Date オブジェクトに変換する関数である．
 * 時刻は 00:00:00 JST となる．
 */
export function parseJSTDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  // JST での日付を作成（ローカルタイムを JST として扱う）
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  return toJST(date);
}

/**
 * Date オブジェクトを JST の YYYY-MM-DD 形式の文字列に変換する関数である．
 */
export function formatJSTDate(date: Date): string {
  const jst = toJST(date);
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, "0");
  const day = String(jst.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Date オブジェクトを JST の YYYY/MM/DD HH:MM 形式の文字列に変換する関数である．
 */
export function formatJSTDateTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const jst = toJST(d);
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, "0");
  const day = String(jst.getDate()).padStart(2, "0");
  const hours = String(jst.getHours()).padStart(2, "0");
  const minutes = String(jst.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

/**
 * Tailwind CSS のクラス名を結合するためのユーティリティ関数である．
 * clsx でクラス名の条件付き結合を行い，twMerge で重複するクラスを統合する．
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 数値を日本円 (JPY) 形式の文字列に変換する関数である．
 * 小数点以下は表示せず，通貨記号を付与する．
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
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
export function assetTypeLabel(
  type: "CASH" | "INVESTMENT" | "CRYPTO" | "POINT",
): string {
  const labels: Record<string, string> = {
    CASH: "預金・現金",
    INVESTMENT: "投資信託・証券",
    CRYPTO: "暗号資産",
    POINT: "ポイント",
  };
  return labels[type] ?? type;
}

/**
 * 資産タイプ (AssetType) に対応するカラーコードを返す関数である．
 * グラフなどの UI 要素での色分けに使用することを想定している．
 */
export function assetTypeColor(
  type: "CASH" | "INVESTMENT" | "CRYPTO" | "POINT",
): string {
  const colors: Record<string, string> = {
    CASH: "#3b82f6", // Blue
    INVESTMENT: "#8b5cf6", // Violet
    CRYPTO: "#f59e0b", // Amber
    POINT: "#10b981", // Emerald
  };
  return colors[type] ?? "#94a3b8";
}

/**
 * @deprecated formatJSTDate を使用してください．
 * Date オブジェクトをローカルタイムゾーンの YYYY-MM-DD 形式の文字列に変換する関数である．
 */
export function toLocalDateString(date: Date): string {
  return formatJSTDate(date);
}
