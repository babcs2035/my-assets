"use server";

import type { AssetType } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { forwardFillByDate, listDateKeysBetween } from "@/lib/daily-series";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  formatJSTDate,
  nowJST,
  shiftUtcDateOnlyByMonths,
  todayJST,
  toUtcDateOnly,
} from "@/lib/utils";

// ── Internal (uncached) implementations ──

async function getDashboardKPIInternal() {
  logger.info("Calculating dashboard KPIs...");
  const subAccounts = await prisma.subAccount.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      balance: true,
      assetType: true,
    },
  });

  // 負債以外の残高をすべて合計する（マイナス残高を含む）．
  // 資産ページ (getAssetBreakdown) と純資産の定義を一致させるため．
  const totalAssets = subAccounts
    .filter(sa => sa.assetType !== "LIABILITY")
    .reduce((sum, sa) => sum + sa.balance, 0);

  const totalLiabilities = subAccounts
    .filter(sa => sa.assetType === "LIABILITY")
    .reduce((sum, sa) => sum + sa.balance, 0);

  const netWorth = totalAssets + totalLiabilities;

  const byAssetType: Record<string, number> = {};
  for (const sa of subAccounts) {
    byAssetType[sa.assetType] = (byAssetType[sa.assetType] ?? 0) + sa.balance;
  }

  const today = todayJST();

  // 前日比の基準は，口座ごとに「今日より前で最新の記録」とする (DASH-4)．
  // 昨日の 1 日分だけを見ると，1 口座でも同期に失敗した日に前日比全体が「—」になるため．
  // 推移グラフ（forwardFillByDate）が欠けた日を直前の残高で埋めるのと同じ考え方にそろえる．
  // 何週間も前の残高との差は前日比と呼べないので，遡るのは 7 日までにする
  const baselineLookbackDays = 7;
  const baselineSince = new Date(today);
  baselineSince.setUTCDate(baselineSince.getUTCDate() - baselineLookbackDays);

  const recentHistories = await prisma.balanceHistory.findMany({
    where: {
      subAccount: { isHidden: false },
      date: {
        gte: baselineSince,
        lt: today,
      },
    },
    select: {
      balance: true,
      date: true,
      subAccountId: true,
      subAccount: {
        select: {
          assetType: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  // 日付の昇順に上書きして，口座ごとに最新の記録だけを残す
  const latestHistoryBySubAccount = new Map<
    string,
    (typeof recentHistories)[number]
  >();
  for (const h of recentHistories) {
    latestHistoryBySubAccount.set(h.subAccountId, h);
  }
  const yesterdayHistories = [...latestHistoryBySubAccount.values()];

  // 全表示口座に基準の記録が存在する場合のみ前日比を計算する．
  // 記録のない口座（追加直後など）を 0 と比較すると「前日比 +¥8,000,000」のような
  // 誤った値が表示されるため，不完全時は null を返す（UI は「—」表示）．
  const visibleIds = new Set(subAccounts.map(sa => sa.id));
  const yesterdayIds = new Set(yesterdayHistories.map(h => h.subAccountId));
  const hasCompleteYesterdayHistory =
    visibleIds.size > 0 && [...visibleIds].every(id => yesterdayIds.has(id));

  const yesterdayTotal = yesterdayHistories.reduce(
    (sum, h) => sum + h.balance,
    0,
  );
  const dailyChange = hasCompleteYesterdayHistory
    ? netWorth - yesterdayTotal
    : null;

  // 基準が昨日でないと数日分の変化を「前日比」と読み違えるため，UI で基準日を示せるよう返す．
  // 口座ごとに基準日が異なりうるので，最も古い日を採る（その日以降の変化をすべて含むため）．
  // unstable_cache を通すので Date ではなく JST の YYYY-MM-DD で返す
  const baselineDateKey = hasCompleteYesterdayHistory
    ? yesterdayHistories
        .map(h => formatJSTDate(h.date))
        .reduce((oldest, key) => (key < oldest ? key : oldest))
    : null;

  const yesterdayByType: Record<string, number> = {};
  for (const h of yesterdayHistories) {
    yesterdayByType[h.subAccount.assetType] =
      (yesterdayByType[h.subAccount.assetType] ?? 0) + h.balance;
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    dailyChange,
    baselineDateKey,
    byAssetType: byAssetType as Record<AssetType, number>,
    yesterdayByType: hasCompleteYesterdayHistory
      ? (yesterdayByType as Record<AssetType, number>)
      : null,
  };
}

async function getAssetHistoryInternal(days?: number) {
  logger.info("Fetching asset history from balanceHistory...");

  // 残高履歴は JST 08:00（前日 23:00Z）で保存される．期間の起点は todayJST()（JST 00:00）から
  // UTC getter/setter で日単位にずらし，日ごとの集計は formatJSTDate で JST の日付に寄せる（TZ 非依存）
  const today = todayJST();
  let since = new Date(today);
  if (days) {
    since.setUTCDate(since.getUTCDate() - days);
  } else {
    const oldestHistory = await prisma.balanceHistory.findFirst({
      select: { date: true },
      orderBy: { date: "asc" },
    });

    if (oldestHistory?.date) {
      since = new Date(oldestHistory.date);
      since.setUTCHours(0, 0, 0, 0);
    } else {
      since.setUTCFullYear(since.getUTCFullYear() - 1);
    }
  }

  const subAccounts = await prisma.subAccount.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      assetType: true,
      balance: true,
    },
  });

  const assetTypeMap = new Map<string, AssetType>();
  for (const sa of subAccounts) {
    assetTypeMap.set(sa.id, sa.assetType);
  }

  const histories = await prisma.balanceHistory.findMany({
    where: {
      subAccount: { isHidden: false },
      date: { gte: since },
    },
    select: {
      subAccountId: true,
      date: true,
      balance: true,
    },
    orderBy: { date: "asc" },
  });

  const createEmptyTotals = (): Record<AssetType, number> => ({
    CASH: 0,
    INVESTMENT: 0,
    CRYPTO: 0,
    POINT: 0,
    LIABILITY: 0,
  });

  // 口座ごとに直前の残高で埋めてから合計する (DASH-3)．記録のある日だけを集計すると，
  // どの口座にも記録がない日は X 軸から抜け，一部の口座だけ欠けた日はその口座が 0 として
  // 合計されて総額が落ち込むため
  const todayKey = formatJSTDate(today);
  const points = histories.map(h => ({
    seriesKey: h.subAccountId,
    dateKey: formatJSTDate(h.date),
    value: h.balance,
  }));
  const startKey = points[0]?.dateKey ?? todayKey;
  const filledDays = forwardFillByDate(
    points,
    listDateKeysBetween(startKey, todayKey),
  );

  const grouped: Record<string, Record<AssetType, number>> = {};
  for (const { dateKey, values } of filledDays) {
    const totals = createEmptyTotals();
    for (const [subAccountId, balance] of values) {
      totals[assetTypeMap.get(subAccountId) ?? "CASH"] += balance;
    }
    grouped[dateKey] = totals;
  }

  // 今日はその日の同期の前でも最新の値を出すため，口座の現在の残高で上書きする
  const todayTotals = createEmptyTotals();
  for (const sa of subAccounts) {
    todayTotals[sa.assetType] += sa.balance;
  }
  grouped[todayKey] = todayTotals;

  return Object.entries(grouped)
    .map(([date, values]) => ({
      date,
      ...values,
      total:
        (values.CASH ?? 0) +
        (values.INVESTMENT ?? 0) +
        (values.CRYPTO ?? 0) +
        (values.POINT ?? 0) +
        (values.LIABILITY ?? 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date)) as Array<{
    date: string;
    total: number;
    CASH: number;
    INVESTMENT: number;
    CRYPTO: number;
    POINT: number;
    LIABILITY: number;
  }>;
}

async function getExpiringPointsInternal() {
  logger.info("Checking for expiring points...");
  // 期限日は JST 日付の UTC 00:00（JST 09:00）で保存している．現在の瞬間と比べると，
  // 今日が期限のポイントが JST 09:00 以降に消えるため，JST の今日の日付で比べる (DASH-12)．
  // 上限は 1 か月後の同じ日にする．翌月 1 日までにすると，月末は 1〜2 日分しか出なかった
  const [year, month, day] = formatJSTDate(nowJST()).split("-").map(Number);
  const today = toUtcDateOnly(year, month, day);
  const oneMonthLater = shiftUtcDateOnlyByMonths(year, month, day, 1);

  const points = await prisma.pointDetail.findMany({
    where: {
      subAccount: { isHidden: false },
      expirationDate: {
        gte: today,
        lte: oneMonthLater,
      },
    },
    select: {
      id: true,
      points: true,
      expirationDate: true,
      subAccount: {
        select: {
          currentName: true,
          mainAccount: { select: { label: true } },
        },
      },
    },
    orderBy: {
      expirationDate: "asc",
    },
  });

  // unstable_cache は結果を JSON で保存するため，キャッシュから返ると Date は
  // ISO 文字列になる．キャッシュの有無で値の型が変わらないよう，ここで文字列にそろえる
  return points.map(p => ({
    ...p,
    expirationDate: p.expirationDate?.toISOString() ?? null,
  }));
}

// ── Cached exports (TTL: 5分) ──

/**
 * ダッシュボードに表示する主要な指標 (KPI) を取得する関数である．
 * 総資産，純資産，前日比，資産タイプ別の内訳を計算する．
 */
export const getDashboardKPI = unstable_cache(
  getDashboardKPIInternal,
  ["dashboard-kpi"],
  { revalidate: 300, tags: ["dashboard"] },
);

/**
 * 指定された日数分の資産推移データを取得する関数である．
 * balanceHistory テーブルから直接残高履歴を取得する（MoneyForward の履歴ページから取得済み）．
 */
export const getAssetHistory = unstable_cache(
  getAssetHistoryInternal,
  ["asset-history"],
  { revalidate: 300, tags: ["asset-history"] },
);

/**
 * 有効期限が 1 ヶ月以内に迫っているポイント情報を取得する関数である．
 * expirationDate は ISO 8601 形式の文字列で返す（Date ではない）．
 */
export const getExpiringPoints = unstable_cache(
  getExpiringPointsInternal,
  ["expiring-points"],
  { revalidate: 300, tags: ["expiring-points"] },
);
