import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
