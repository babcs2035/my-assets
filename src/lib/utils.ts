import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 入出金明細・残高推移のバックフィル開始日（JST）である．
 * スクレイパーの全量同期・手動同期ダイアログ・年別ナビゲータの
 * 下限年がすべてこの日付を基準にしているため，定数として共有する．
 */
export const BACKFILL_START_DATE = "2023-01-01";

/**
 * 入出金集計（推移・年別）の対象とする明細の開始日である．
 * バックフィル開始日とは別に，集計対象を 2024 年以降に絞るための意図的なデータ起点である．
 * 収支ページの年月ナビゲーターの下限もこれに揃えるため，"use server" の action
 * （async 関数しか export できない）ではなくここで共有する．
 */
export const INCOME_EXPENSE_AGGREGATION_START_DATE = "2024-01-01";

/**
 * URL の年月パラメーター（YYYY-MM）を年と月に変換する関数である．
 * 再読み込みや戻る操作で，選んでいた月を開き直すために使う (TX-7)．
 * 形式が違う場合や，minDate の月から JST の今月までの範囲の外の場合は null を返す．
 * 範囲の外を受け入れると，年月ナビゲーターで選べない月が URL から開けてしまう．
 */
export function parseYearMonthParam(
  value: string | string[] | undefined,
  minDate: string,
): { year: number; month: number } | null {
  // 同じ名前のパラメーターが複数あると配列になるが，どれを採るか決められないので捨てる
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  // "YYYY-MM" は辞書順と時系列の順が一致するので，文字列のまま範囲を比べる
  const currentMonthKey = formatJSTDate(nowJST()).slice(0, 7);
  if (value < minDate.slice(0, 7) || value > currentMonthKey) return null;
  return { year, month };
}

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
 * 年月日を，その日付の UTC 00:00 を表す Date に変換する関数である．
 * 取引日や請求日などの日付のみの値は「JST 日付の UTC 00:00」として保存しているため，
 * DB のクエリ境界はこの関数で組み立てる．
 */
export function toUtcDateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 基準価額の前回比を，小数第 2 位までの百分率で返す関数である．
 * 比べる価格がない，または 0 以下のときは割合を出せないため null を返す．
 */
export function calculateDayBeforeRatio(
  currentPrice: number,
  previousPrice: number | null | undefined,
): number | null {
  if (previousPrice == null || previousPrice <= 0) return null;
  return (
    Math.round(((currentPrice - previousPrice) / previousPrice) * 10000) / 100
  );
}

/**
 * 年月日を months か月ずらした日付の UTC 00:00 を返す関数である．
 * ずらした先の月に同じ日がなければ，その月の末日に丸める（3/31 の 1 か月前は 2/28）．
 * Date.UTC の日の繰り上がりに任せると 3/31 の 1 か月前が 3/3 になるため，日を先に丸める．
 */
export function shiftUtcDateOnlyByMonths(
  year: number,
  month: number,
  day: number,
  months: number,
): Date {
  const targetMonthIndex = month - 1 + months;
  // 翌月の 0 日目は対象月の末日になる．月インデックスが 0〜11 を外れても Date.UTC が年をまたぐ
  const lastDay = new Date(
    Date.UTC(year, targetMonthIndex + 1, 0),
  ).getUTCDate();
  return new Date(Date.UTC(year, targetMonthIndex, Math.min(day, lastDay)));
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
 * 毎日の自動同期を始める時刻（JST の時）である．
 * スケジューラと画面の同期状態の表示が同じ境目を使うよう，クライアントからも読める utils に置く
 */
export const SYNC_HOUR_JST = 8;

/**
 * 今日の自動同期の時刻（08:00 JST）の瞬間を返す関数である．
 * todayJST() は TZ に依存せず JST 00:00 の瞬間を返し，JST には夏時間がないので 8 時間足せばよい
 */
export function retrieveTodaySyncTimeJST(): Date {
  return new Date(todayJST().getTime() + SYNC_HOUR_JST * 60 * 60 * 1000);
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
 * 金額を円表記（例: ¥1,234,567，-¥1,234）にする関数である．
 * 負の数をそのまま `toLocaleString` に渡すと `¥-1,234` になるので，絶対値を整形してから記号を ¥ の前に置く．
 * `Intl.NumberFormat` の `currency: "JPY"` は全角の「￥」を出すので使わない
 */
export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}¥${Math.abs(amount).toLocaleString("ja-JP")}`;
}

/**
 * 増減を表す金額を，0 以上にも + を付けた円表記（例: +¥1,234，-¥1,234）にする関数である．
 */
export function formatSignedCurrency(amount: number): string {
  return amount >= 0 ? `+${formatCurrency(amount)}` : formatCurrency(amount);
}

/**
 * 数値をパーセント表記 (例: +5.00%) に変換する関数である．
 * 小数第 2 位まで表示し，正の数の場合は + 記号を付与する．
 */
export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

/**
 * base から current への増減率を百分率の文字列 (例: +5.00%) にする関数である．
 * base が 0 だと率が定まらないので null を返し，呼び出し元で率を出さない (DASH-5)．
 * base が少額だと数千 % になって表の列を押し広げ，数字としての意味も薄いので，±1000% 以上は丸める．
 * base が負のときも増えた向きを + にするため，絶対値で割る
 */
export function formatChangeRate(current: number, base: number): string | null {
  if (base === 0) return null;
  const rate = (current - base) / Math.abs(base);
  if (rate >= 10) return ">+999%";
  if (rate <= -10) return "<-999%";
  return formatPercent(rate);
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
