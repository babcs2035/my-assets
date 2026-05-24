import "dotenv/config";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { generateTransactionId } from "../lib/hash";
import logger from "../lib/logger";
import { getItemField, getItemOtp } from "../lib/onepassword";
import { prisma } from "../lib/prisma";
import { formatJSTDate, todayJST } from "../lib/utils";

// エントリポイント（直接実行）のみ自動スクレイピングを許可
const isEntry =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].endsWith("mf-scraper.ts") ||
    process.argv[1].endsWith("mf-scraper.js"));

const normalizeInstitutionName = (name: string) =>
  name.split(/[（(]/)[0].replace(/\s+/g, " ").trim();

const MF_BACKFILL_START_DATE = "2023-01-01";

const toUtcDateOnly = (ymd: string) => {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const normalizeLoose = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[()（）「」『』【】\-ー―‐/・.,]/g, "")
    .toLowerCase();

const isPlaceholderSubAccountName = (name: string) => {
  const n = normalizeLoose(name);
  return n === "main" || n === "メイン";
};

/**
 * 1Password から credentials を取得する．
 * src/lib/onepassword.ts の getItemField を使用する．
 */
function getCredentials(providerName: string) {
  try {
    const email = getItemField(providerName, "username");
    const password = getItemField(providerName, "password");
    return { email, password };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ msg }, "🚫 Failed to get credentials from 1Password.");
    throw error;
  }
}

type MfSubAccountSummary = {
  sub_account_id_hash: string;
  sub_name: string;
  sub_type: string;
  sub_number: string;
  is_point?: boolean;
  includes_liability?: boolean;
  user_asset_det_summaries?: Array<{
    value?: number;
    jpyvalue?: number;
  }>;
};

type MfAccountSummary = {
  name: string;
  account_id_hash: string;
  show_path: string;
  service_category_id?: string | number;
  sub_accounts?: MfSubAccountSummary[];
};

function buildSubAccountMergeName(subType: string, subName: string): string {
  const normalizedType = subType?.trim();
  if (normalizedType) return normalizedType;
  const normalizedName = subName?.trim();
  if (normalizedName) return normalizedName;
  return "メイン";
}

function extractShowAccountId(showPath: string): string | null {
  const match = showPath.match(/\/sp2\/accounts\/([^/?#]+)/);
  return match?.[1] ?? null;
}

async function fetchJson<T>(page: Page, url: string): Promise<T> {
  const res = await page.request.get(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "x-requested-with": "XMLHttpRequest",
    },
  });
  if (!res.ok()) {
    throw new Error(`API request failed (${res.status()}): ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchAccountSummaries(page: Page): Promise<MfAccountSummary[]> {
  const payload = await fetchJson<{ accounts?: MfAccountSummary[] }>(
    page,
    "https://moneyforward.com/sp2/account_summaries",
  );
  return payload.accounts ?? [];
}

async function fetchTermDataBySubAccount(
  page: Page,
  subAccountIdHash: string,
  from: string,
  to: string,
) {
  const params = new URLSearchParams({
    sub_account_id_hash: subAccountIdHash,
    from,
    to,
  });
  return await fetchJson<{
    result?: string;
    user_asset_acts?: Array<{
      user_asset_act: {
        id: number;
        content: string;
        amount: number;
        recognized_at: string;
        is_transfer: boolean;
        transfer_type?: string;
        sub_account_id_hash?: string;
        partner_act_id?: number;
        partner_account?: {
          partner_account?: {
            account_id_hash?: string;
            display_name?: string | null;
          };
        } | null;
        partner_sub_account?: {
          partner_sub_account?: {
            sub_name?: string;
            sub_type?: string;
          };
        } | null;
        account?: {
          account?: {
            service?: {
              service?: {
                service_name?: string;
              };
            };
          };
        } | null;
        sub_account?: {
          sub_account?: {
            sub_name?: string;
            sub_type?: string;
          };
        } | null;
        partner_act?: {
          sub_account_id_hash?: string;
          partner_sub_account_id_hash?: string;
        } | null;
      };
    }>;
  }>(
    page,
    `https://moneyforward.com/sp/cf_term_data_by_sub_account?${params.toString()}`,
  );
}

type MfServiceDetailResponse = {
  result?: string;
  account_detail?: {
    from_date?: string;
    to_date?: string;
    disp_sum_history?: Record<string, number[]>;
  };
};

async function fetchServiceDetailBySubAccount(
  page: Page,
  accountIdHash: string,
  subAccountIdHash: string,
  range: number,
) {
  const params = new URLSearchParams();
  params.set("sub_account_id_hash", subAccountIdHash);
  params.set("range", String(range));
  return await fetchJson<MfServiceDetailResponse>(
    page,
    `https://moneyforward.com/sp/service_detail/${accountIdHash}?${params.toString()}`,
  );
}

/**
 * MF のすべての登録済み金融機関の同期処理をトリガーする
 */
async function triggerSync(page: Page, providerId: string) {
  logger.info("🔄 Triggering sync for registered accounts...");

  // 明示的に accounts ページへ移動
  if (!page.url().includes("/accounts")) {
    await page.goto("https://moneyforward.com/accounts");
  }

  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: { label: true },
  });
  const targetLabels = new Set(
    mainAccounts.map(a => normalizeInstitutionName(a.label)),
  );
  logger.info(
    { accounts: Array.from(targetLabels).join(", ") },
    "📋 Target accounts for sync.",
  );

  const rows = await page.locator("#account-table tbody tr").all();
  let triggeredCount = 0;

  for (const row of rows) {
    const serviceLink = row.locator("td.service a").first();
    if ((await serviceLink.count()) === 0) continue;

    const serviceNameFull = await serviceLink.innerText();
    const serviceName = normalizeInstitutionName(serviceNameFull);
    if (targetLabels.has(serviceName)) {
      const updateButton = row.locator(
        'form input[type="submit"][value="更新"]',
      );
      if (
        (await updateButton.count()) > 0 &&
        (await updateButton.isVisible())
      ) {
        logger.info({ serviceName }, "🔄 Clicking update.");
        await updateButton.click();
        triggeredCount++;
        await page.waitForTimeout(1000);
      }
    }
  }
  logger.info({ accounts: triggeredCount }, "✅ Triggered sync for accounts.");
}

/**
 * 金融機関ごとの口座残高をスクレイピングする
 */
async function scrapeBalances(page: Page, providerId: string) {
  logger.info("💰 Scraping account balances...");

  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: { label: true },
  });
  const targetLabels = new Set(
    mainAccounts.map(a => normalizeInstitutionName(a.label)),
  );

  logger.info(
    { accounts: Array.from(targetLabels).join(", ") },
    "📋 Target accounts (DB).",
  );

  const accountSummaries = await fetchAccountSummaries(page);
  const targetAccounts = accountSummaries.filter(acc =>
    targetLabels.has(normalizeInstitutionName(acc.name)),
  );

  logger.info(
    { count: targetAccounts.length },
    "✅ Processing accounts matching DB records.",
  );

  const results: Array<{
    institutionName: string;
    subAccountName: string;
    balance: number;
    mfUrlId: string | null;
    subAccountIdHash?: string;
    accountIdHash?: string;
  }> = [];

  for (const account of targetAccounts) {
    const showAccountId = extractShowAccountId(account.show_path);
    const subAccounts = account.sub_accounts ?? [];
    const seenSubHashes = new Set<string>();
    const mergedBySubType = new Map<
      string,
      {
        institutionName: string;
        subAccountName: string;
        balance: number;
        mfUrlId: string | null;
        subAccountIdHash?: string;
        accountIdHash?: string;
      }
    >();

    for (const sa of subAccounts) {
      const subHash = sa.sub_account_id_hash;
      if (!subHash || seenSubHashes.has(subHash)) continue;
      seenSubHashes.add(subHash);

      const subAccountName = buildSubAccountMergeName(sa.sub_type, sa.sub_name);
      const summaries = sa.user_asset_det_summaries ?? [];
      const balance = Math.trunc(
        summaries.reduce((sum, item) => {
          const value = item.jpyvalue ?? item.value ?? 0;
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0),
      );

      const existing = mergedBySubType.get(subAccountName);
      if (existing) {
        existing.balance += balance;
      } else {
        mergedBySubType.set(subAccountName, {
          institutionName: normalizeInstitutionName(account.name),
          subAccountName,
          balance,
          mfUrlId: showAccountId,
          subAccountIdHash: subHash,
          accountIdHash: account.account_id_hash,
        });
      }
    }

    results.push(...mergedBySubType.values());
  }

  logger.info({ count: results.length }, "✅ Collected balances.");
  return results;
}

/**
 * 直近の入出金明細をスクレイピングする (今月＋先月)
 */
async function scrapeTransactions(
  page: Page,
  providerId: string,
  _balances: Awaited<ReturnType<typeof scrapeBalances>>,
  _allSubAccountNames: Map<string, string[]>, // 全金融機関の子口座名（将来のフォールバック用）
  options: MfScraperOptions,
) {
  logger.info("📝 Scraping transactions via MF APIs...");

  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: {
      id: true,
      label: true,
      subAccounts: { select: { currentName: true } },
    },
  });

  const targetInstitutionNames = new Set(
    mainAccounts.map(ma => normalizeInstitutionName(ma.label)),
  );

  if (targetInstitutionNames.size === 0) {
    logger.info("⚠️ No registered accounts found for transactions.");
    return [];
  }

  const allAccounts = await fetchAccountSummaries(page);
  const targetAccounts = allAccounts.filter(acc =>
    targetInstitutionNames.has(normalizeInstitutionName(acc.name)),
  );
  const accountNameByIdHash = new Map(
    allAccounts.map(acc => [acc.account_id_hash, acc.name]),
  );

  const globalSubAccountNameByHash = new Map<string, string>();
  for (const account of targetAccounts) {
    for (const sa of account.sub_accounts ?? []) {
      if (!sa.sub_account_id_hash) continue;
      globalSubAccountNameByHash.set(
        sa.sub_account_id_hash,
        buildSubAccountMergeName(sa.sub_type, sa.sub_name),
      );
    }
  }

  const allTransactions: Array<{
    date: string;
    desc: string;
    amount: number;
    institutionName: string;
    subAccountName: string;
    msgUrlId: string;
    rawInfo: string;
    isTransfer: boolean;
    transferFromSubAccount?: string;
    transferToSubAccount?: string;
    subAccountIdHash?: string;
    partnerSubAccountIdHash?: string;
    partnerInstitutionName?: string;
    partnerSubAccountName?: string;
  }> = [];
  const seenActIds = new Set<number>();

  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);
  const minBackfillMonthStart = new Date(
    `${MF_BACKFILL_START_DATE}T00:00:00+09:00`,
  );
  minBackfillMonthStart.setDate(1);
  minBackfillMonthStart.setHours(0, 0, 0, 0);

  for (const account of targetAccounts) {
    const isIncrementalSync = options.mode === "scheduled";

    const accountSubAccounts = (account.sub_accounts ?? [])
      .filter(sa => sa.sub_account_id_hash)
      .map(sa => ({
        hash: sa.sub_account_id_hash,
        name: buildSubAccountMergeName(sa.sub_type, sa.sub_name),
      }));
    const localSubNameByHash = new Map(
      accountSubAccounts.map(sa => [sa.hash, sa.name]),
    );

    if (accountSubAccounts.length === 0) {
      logger.warn(
        { account: account.name },
        "⚠️ No sub accounts for. Skipping transactions.",
      );
      continue;
    }

    logger.debug(
      {
        account: account.name,
        mode: isIncrementalSync
          ? "incremental: 2 months"
          : `backfill to ${MF_BACKFILL_START_DATE}`,
      },
      "Processing transactions.",
    );

    const windows: Array<{ from: string; to: string }> = [];
    if (isIncrementalSync) {
      const cursor = new Date(currentMonthStart);
      for (let i = 0; i < 2; i++) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, "0");
        const from = `${y}-${m}-01`;
        const monthEnd = new Date(y, cursor.getMonth() + 1, 0);
        const to = `${y}-${m}-${String(monthEnd.getDate()).padStart(2, "0")}`;
        windows.push({ from, to });
        cursor.setMonth(cursor.getMonth() - 1);
      }
    } else {
      // API の取得上限を 1 年に制限し、バックフィル時は 1 年単位で区切って遡及する
      const chunkMonths = 12;
      let chunkEnd = new Date(currentMonthStart);
      while (chunkEnd.getTime() >= minBackfillMonthStart.getTime()) {
        const chunkStart = new Date(chunkEnd);
        chunkStart.setMonth(chunkStart.getMonth() - (chunkMonths - 1));
        if (chunkStart.getTime() < minBackfillMonthStart.getTime()) {
          chunkStart.setTime(minBackfillMonthStart.getTime());
        }

        const from = `${chunkStart.getFullYear()}-${String(chunkStart.getMonth() + 1).padStart(2, "0")}-01`;
        const to = `${chunkEnd.getFullYear()}-${String(chunkEnd.getMonth() + 1).padStart(2, "0")}-${String(new Date(chunkEnd.getFullYear(), chunkEnd.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
        windows.push({ from, to });

        chunkEnd = new Date(chunkStart);
        chunkEnd.setMonth(chunkEnd.getMonth() - 1);
      }
    }

    for (const { from, to } of windows) {
      for (const sa of accountSubAccounts) {
        try {
          const payload = await fetchTermDataBySubAccount(
            page,
            sa.hash,
            from,
            to,
          );
          const acts = payload.user_asset_acts ?? [];

          for (const wrapper of acts) {
            const act = wrapper.user_asset_act;
            if (!act || seenActIds.has(act.id)) continue;
            seenActIds.add(act.id);

            const recognizedDate = act.recognized_at?.slice(0, 10);
            const amount = Math.trunc(Number(act.amount));
            if (!recognizedDate || !Number.isFinite(amount)) continue;

            const subAccountIdHash = act.sub_account_id_hash ?? sa.hash;
            const partnerSubAccountIdHash =
              act.partner_act?.sub_account_id_hash ??
              act.partner_act?.partner_sub_account_id_hash ??
              undefined;
            const partnerAccountIdHash =
              act.partner_account?.partner_account?.account_id_hash;

            const currentSubName =
              localSubNameByHash.get(subAccountIdHash) ??
              globalSubAccountNameByHash.get(subAccountIdHash) ??
              sa.name;

            const partnerSubFromPayload = buildSubAccountMergeName(
              act.partner_sub_account?.partner_sub_account?.sub_type ?? "",
              act.partner_sub_account?.partner_sub_account?.sub_name ?? "",
            );
            const currentSubFromPayload = buildSubAccountMergeName(
              act.sub_account?.sub_account?.sub_type ?? "",
              act.sub_account?.sub_account?.sub_name ?? "",
            );
            const partnerSubName = partnerSubAccountIdHash
              ? globalSubAccountNameByHash.get(partnerSubAccountIdHash)
              : partnerSubFromPayload !== "メイン"
                ? partnerSubFromPayload
                : undefined;
            const partnerInstitutionName =
              (partnerAccountIdHash
                ? accountNameByIdHash.get(partnerAccountIdHash)
                : undefined) ??
              act.partner_account?.partner_account?.display_name ??
              undefined;

            let transferFromSubAccount: string | undefined;
            let transferToSubAccount: string | undefined;
            if (act.is_transfer && partnerSubName) {
              if (amount < 0) {
                transferFromSubAccount =
                  currentSubName || currentSubFromPayload || sa.name;
                transferToSubAccount = partnerSubName;
              } else {
                transferFromSubAccount = partnerSubName;
                transferToSubAccount =
                  currentSubName || currentSubFromPayload || sa.name;
              }
            }

            allTransactions.push({
              date: recognizedDate,
              desc: (act.content || "").trim(),
              amount,
              institutionName: normalizeInstitutionName(account.name),
              subAccountName: currentSubName,
              msgUrlId: String(act.id),
              rawInfo: JSON.stringify({
                transferType: act.transfer_type,
                subAccountIdHash,
                partnerSubAccountIdHash,
                partnerAccountIdHash,
                partnerInstitutionName,
                partnerSubName,
                partnerActId: act.partner_act_id,
              }),
              isTransfer: Boolean(act.is_transfer),
              transferFromSubAccount,
              transferToSubAccount,
              subAccountIdHash,
              partnerSubAccountIdHash,
              partnerInstitutionName: partnerInstitutionName ?? undefined,
              partnerSubAccountName: partnerSubName ?? undefined,
            });
          }
        } catch (error) {
          logger.warn(
            { err: error, account: account.name, subHash: sa.hash, from, to },
            "⚠️ Failed to fetch transactions.",
            error,
          );
        }
      }
    }
  }

  logger.info({ count: allTransactions.length }, "✅ Found transactions.");
  return allTransactions;
}

/**
 * 残高履歴ページから過去の残高を取得する（全金融機関対象）
 * URL: https://moneyforward.com/bs/history/list/{YYYY-MM-DD}
 * 履歴ページには全金融機関のデータが含まれるため、一度のループで全口座を処理する。
 */
async function scrapeBalanceHistory(page: Page, options: MfScraperOptions) {
  logger.info("📊 Scraping balance history via service_detail API...");

  const toJstMidnight = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00+09:00`);
  const formatYmd = (d: Date) => formatJSTDate(d);
  const diffDaysInclusive = (from: Date, to: Date) =>
    Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const buildHistoryFromTransactions = async (
    subAccountId: string,
    endDateBalance: number,
    startDate: Date,
    endDate: Date,
    options?: {
      trimBeforeFirstTransaction?: boolean;
      includeEndPointWhenNoTransactions?: boolean;
    },
  ) => {
    const txs = await prisma.transaction.findMany({
      where: {
        subAccountId,
        date: { gte: startDate, lte: endDate },
      },
      select: {
        date: true,
        amount: true,
      },
    });

    const dailyNetByDate = new Map<string, number>();
    for (const tx of txs) {
      const dateKey = formatJSTDate(tx.date);
      dailyNetByDate.set(
        dateKey,
        (dailyNetByDate.get(dateKey) ?? 0) + tx.amount,
      );
    }

    const txDateKeys = Array.from(dailyNetByDate.keys()).sort();
    const effectiveStartDate =
      options?.trimBeforeFirstTransaction && txDateKeys.length > 0
        ? toJstMidnight(txDateKeys[0])
        : startDate;

    if (
      txDateKeys.length === 0 &&
      options?.includeEndPointWhenNoTransactions === true
    ) {
      return new Map<string, number>([
        [formatYmd(endDate), Math.trunc(endDateBalance)],
      ]);
    }

    const inferredHistory = new Map<string, number>();
    let runningBalance = Math.trunc(endDateBalance);
    for (
      let cursor = new Date(endDate);
      cursor.getTime() >= effectiveStartDate.getTime();
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
    ) {
      const dateKey = formatYmd(cursor);
      inferredHistory.set(dateKey, runningBalance);
      runningBalance -= dailyNetByDate.get(dateKey) ?? 0;
    }
    return inferredHistory;
  };
  const parseMergedHistory = (
    detail?: MfServiceDetailResponse["account_detail"],
    options?: { preferLiabilitySeries?: boolean },
  ) => {
    const toDateStr = detail?.to_date;
    const fromDateStr = detail?.from_date;
    const histories = detail?.disp_sum_history ?? {};
    const historyEntries = Object.entries(histories).filter(
      (entry): entry is [string, number[]] =>
        Array.isArray(entry[1]) && entry[1].length > 0,
    );
    const preferredSeriesByType = options?.preferLiabilitySeries
      ? historyEntries
          .filter(([key]) => key.toUpperCase().includes("LIA"))
          .map(([, series]) => series)
      : [];
    const seriesByType =
      preferredSeriesByType.length > 0
        ? preferredSeriesByType
        : historyEntries.map(([, series]) => series);
    if (!toDateStr || seriesByType.length === 0) return null;

    const seriesLen = Math.max(...seriesByType.map(arr => arr.length));
    if (seriesLen <= 0) return null;

    const mergedSeries = Array.from({ length: seriesLen }, (_, index) =>
      Math.trunc(seriesByType.reduce((sum, arr) => sum + (arr[index] ?? 0), 0)),
    );
    return { toDateStr, fromDateStr, mergedSeries };
  };

  const providers = await prisma.provider.findMany({
    where: { type: "mf", isActive: true },
    select: { id: true },
  });
  const providerIds = providers.map(p => p.id);
  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId: { in: providerIds } },
    include: { subAccounts: true },
  });

  if (mainAccounts.length === 0) {
    logger.info("⚠️ No main accounts found for balance history.");
    return;
  }

  const accountSummaries = await fetchAccountSummaries(page);
  const summaryByShowId = new Map<string, MfAccountSummary>();
  for (const summary of accountSummaries) {
    const showId = extractShowAccountId(summary.show_path);
    if (showId) {
      summaryByShowId.set(showId, summary);
    }
  }

  const today = todayJST();
  today.setHours(0, 0, 0, 0);

  let minDate = new Date(today);
  if (options.mode === "manual") {
    minDate = toJstMidnight(MF_BACKFILL_START_DATE);
  } else {
    minDate.setMonth(minDate.getMonth() - 2);
  }
  minDate.setHours(0, 0, 0, 0);

  const configuredMaxRange = Number(process.env.MF_HISTORY_RANGE_DAYS ?? 0);
  const getRangeCandidates = (neededDays: number) =>
    Array.from(
      new Set(
        [
          30,
          60,
          90,
          180,
          365,
          730,
          1095,
          1460,
          1825,
          neededDays,
          configuredMaxRange > 0 ? configuredMaxRange : 0,
        ].filter(v => Number.isFinite(v) && v > 0),
      ),
    ).sort((a, b) => a - b);

  let totalSaved = 0;
  let totalSubAccounts = 0;

  for (const mainAccount of mainAccounts) {
    const summary = mainAccount.mfUrlId
      ? summaryByShowId.get(mainAccount.mfUrlId)
      : accountSummaries.find(
          acc =>
            normalizeInstitutionName(acc.name) ===
            normalizeInstitutionName(mainAccount.label),
        );

    if (!summary?.account_id_hash) {
      continue;
    }

    const subSummaryByDisplayName = new Map<string, MfSubAccountSummary[]>();
    const subSummaryByNormalizedDisplay = new Map<
      string,
      MfSubAccountSummary[]
    >();
    for (const sa of summary.sub_accounts ?? []) {
      const display = buildSubAccountMergeName(sa.sub_type, sa.sub_name);
      const byDisplay = subSummaryByDisplayName.get(display) ?? [];
      byDisplay.push(sa);
      subSummaryByDisplayName.set(display, byDisplay);
      const normalizedDisplay = normalizeLoose(display);
      if (normalizedDisplay) {
        const byNormalized =
          subSummaryByNormalizedDisplay.get(normalizedDisplay) ?? [];
        byNormalized.push(sa);
        subSummaryByNormalizedDisplay.set(normalizedDisplay, byNormalized);
      }
    }

    for (const subAccount of mainAccount.subAccounts) {
      const isLiabilitySubAccount = subAccount.assetType === "LIABILITY";
      let candidateSubSummaries =
        subSummaryByDisplayName.get(subAccount.currentName) ??
        subSummaryByNormalizedDisplay.get(
          normalizeLoose(subAccount.currentName),
        );
      if (!candidateSubSummaries || candidateSubSummaries.length === 0) {
        const normalizedSubName = normalizeLoose(subAccount.currentName);
        candidateSubSummaries = (summary.sub_accounts ?? []).filter(sa => {
          const display = buildSubAccountMergeName(sa.sub_type, sa.sub_name);
          const normalizedDisplay = normalizeLoose(display);
          return (
            normalizedDisplay.includes(normalizedSubName) ||
            normalizedSubName.includes(normalizedDisplay)
          );
        });
      }
      if (
        (!candidateSubSummaries || candidateSubSummaries.length === 0) &&
        subAccount.assetType === "LIABILITY"
      ) {
        const liabilityCandidates = (summary.sub_accounts ?? []).filter(
          sa => sa.includes_liability,
        );
        if (liabilityCandidates.length > 0) {
          candidateSubSummaries = liabilityCandidates;
        }
      }
      if (
        (!candidateSubSummaries || candidateSubSummaries.length === 0) &&
        (summary.sub_accounts?.length ?? 0) === 1
      ) {
        candidateSubSummaries = summary.sub_accounts ?? [];
      }
      const uniqueCandidateSubSummaries = Array.from(
        new Map(
          (candidateSubSummaries ?? [])
            .filter(sa => Boolean(sa.sub_account_id_hash))
            .map(sa => [sa.sub_account_id_hash, sa]),
        ).values(),
      );
      if (!isLiabilitySubAccount && uniqueCandidateSubSummaries.length === 0)
        continue;
      totalSubAccounts++;

      try {
        let mergedHistoryByDate = new Map<string, number>();

        if (isLiabilitySubAccount) {
          mergedHistoryByDate = await buildHistoryFromTransactions(
            subAccount.id,
            subAccount.balance,
            minDate,
            today,
            {
              trimBeforeFirstTransaction: true,
              includeEndPointWhenNoTransactions: true,
            },
          );
          logger.info(
            {
              label: mainAccount.label,
              subAccount: subAccount.currentName,
              points: mergedHistoryByDate.size,
            },
            "📈 Liability history rebuilt from transactions.",
          );
        } else {
          for (const subSummary of uniqueCandidateSubSummaries) {
            const subSummaryHistoryByDate = new Map<string, number>();
            let anchorDate = new Date(today);

            while (anchorDate.getTime() >= minDate.getTime()) {
              const anchorStr = formatYmd(anchorDate);
              await page.goto(
                `https://moneyforward.com/bs/history/list/${anchorStr}`,
                {
                  waitUntil: "domcontentloaded",
                },
              );

              const neededDaysForAnchor = Math.max(
                1,
                diffDaysInclusive(minDate, anchorDate),
              );
              const rangeCandidates = getRangeCandidates(neededDaysForAnchor);

              let best: {
                range: number;
                toDateStr: string;
                fromDateStr?: string;
                mergedSeries: number[];
              } | null = null;

              for (const range of rangeCandidates) {
                const payload = await fetchServiceDetailBySubAccount(
                  page,
                  summary.account_id_hash,
                  subSummary.sub_account_id_hash,
                  range,
                );
                const parsed = parseMergedHistory(payload.account_detail, {
                  preferLiabilitySeries: false,
                });
                if (!parsed) continue;

                if (
                  !best ||
                  parsed.mergedSeries.length > best.mergedSeries.length ||
                  (parsed.mergedSeries.length === best.mergedSeries.length &&
                    range > best.range)
                ) {
                  best = {
                    range,
                    toDateStr: parsed.toDateStr,
                    fromDateStr: parsed.fromDateStr,
                    mergedSeries: parsed.mergedSeries,
                  };
                }
              }

              if (!best) break;
              const { toDateStr, fromDateStr, mergedSeries } = best;

              const toDate = toJstMidnight(toDateStr);
              const inferredFromDate = new Date(toDate);
              inferredFromDate.setDate(
                toDate.getDate() - (mergedSeries.length - 1),
              );

              logger.debug(
                {
                  label: mainAccount.label,
                  subAccount: subAccount.currentName,
                  subHash: subSummary.sub_account_id_hash,
                  anchor: anchorStr,
                  range: best.range,
                  points: mergedSeries.length,
                  from: formatYmd(inferredFromDate),
                  to: toDateStr,
                },
                "History range selected.",
              );

              if (fromDateStr) {
                const reportedFromDate = toJstMidnight(fromDateStr);
                const expectedDays = diffDaysInclusive(
                  reportedFromDate,
                  toDate,
                );
                if (expectedDays !== mergedSeries.length) {
                  logger.warn(
                    {
                      label: mainAccount.label,
                      subAccount: subAccount.currentName,
                      subHash: subSummary.sub_account_id_hash,
                      fromDate: fromDateStr,
                      toDate: toDate.toISOString().split("T")[0],
                      expected: expectedDays,
                      actual: mergedSeries.length,
                      from: formatYmd(inferredFromDate),
                      to: toDateStr,
                    },
                    "⚠️ disp_sum_history length mismatch.",
                  );
                }
              }

              const clippedFromDate =
                inferredFromDate.getTime() < minDate.getTime()
                  ? new Date(minDate)
                  : inferredFromDate;
              const clippedToDate =
                toDate.getTime() > anchorDate.getTime()
                  ? new Date(anchorDate)
                  : toDate;

              for (let i = 0; i < mergedSeries.length; i++) {
                const day = new Date(
                  inferredFromDate.getTime() + i * 24 * 60 * 60 * 1000,
                );
                if (day < clippedFromDate || day > clippedToDate) continue;
                if (day < minDate || day > today) continue;

                const dateKey = formatYmd(day);
                const balance = mergedSeries[i];
                if (!Number.isFinite(balance)) continue;
                subSummaryHistoryByDate.set(dateKey, Math.trunc(balance));
              }

              if (inferredFromDate.getTime() <= minDate.getTime()) {
                break;
              }

              const nextAnchor = new Date(inferredFromDate);
              nextAnchor.setDate(nextAnchor.getDate() - 1);
              if (nextAnchor.getTime() >= anchorDate.getTime()) {
                logger.warn(
                  {
                    label: mainAccount.label,
                    subAccount: subAccount.currentName,
                    subHash: subSummary.sub_account_id_hash,
                    anchor: anchorStr,
                  },
                  "⚠️ History pagination stalled. Stopping pagination.",
                );
                break;
              }
              anchorDate = nextAnchor;
            }

            for (const [dateKey, balance] of subSummaryHistoryByDate) {
              mergedHistoryByDate.set(
                dateKey,
                Math.trunc((mergedHistoryByDate.get(dateKey) ?? 0) + balance),
              );
            }
          }
        }

        for (const [dateKey, balance] of Array.from(
          mergedHistoryByDate.entries(),
        ).sort((a, b) => a[0].localeCompare(b[0]))) {
          const historyDate = new Date(`${dateKey}T08:00:00+09:00`);
          await prisma.balanceHistory.upsert({
            where: {
              subAccountId_date: {
                subAccountId: subAccount.id,
                date: historyDate,
              },
            },
            create: {
              subAccountId: subAccount.id,
              date: historyDate,
              balance,
            },
            update: {
              balance,
            },
          });
          totalSaved++;
        }
      } catch (error) {
        logger.warn(
          {
            err: error,
            label: mainAccount.label,
            subAccount: subAccount.currentName,
          },
          "⚠️ Failed to fetch history.",
        );
      }
    }
  }

  logger.info(
    { saved: totalSaved, subAccounts: totalSubAccounts },
    "✅ Balance history scraping complete.",
  );
}

/**
 * 取得データをDBに保存する (詳細ログ付き)
 */
/**
 * 残高情報のみをDBに保存する関数
 */
async function saveBalancesToDatabase(
  balances: Awaited<ReturnType<typeof scrapeBalances>>,
  providerId: string,
) {
  logger.info("💾 Saving balances to database...");

  const allMainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
  });

  // 口座情報の保存
  for (const account of balances) {
    if (!Number.isFinite(account.balance)) {
      logger.warn(
        {
          institution: account.institutionName,
          subAccount: account.subAccountName,
          balance: account.balance,
        },
        "⚠️ Skip invalid balance.",
      );
      continue;
    }

    let mainAccount = null;

    // 既存口座への紐付けは「正規化された名称」または「mfUrlId」で行う
    // account.institutionName は取得時にすでに normalizeInstitutionName 済みであるため、DB側の label も正規化して比較する
    mainAccount =
      allMainAccounts.find(
        ma =>
          normalizeInstitutionName(ma.label) === account.institutionName ||
          (ma.mfUrlId && account.mfUrlId && ma.mfUrlId === account.mfUrlId),
      ) || null;

    if (!mainAccount) {
      mainAccount = await prisma.mainAccount.create({
        data: {
          label: account.institutionName,
          providerId,
          mfUrlId: account.mfUrlId,
        },
      });
      allMainAccounts.push(mainAccount);
    } else if (!mainAccount.mfUrlId && account.mfUrlId) {
      mainAccount = await prisma.mainAccount.update({
        where: { id: mainAccount.id },
        data: { mfUrlId: account.mfUrlId },
      });
      // 更新後の内容を配列にも反映
      if (mainAccount) {
        const updatedId = mainAccount.id;
        const idx = allMainAccounts.findIndex(ma => ma.id === updatedId);
        if (idx !== -1) allMainAccounts[idx] = mainAccount;
      }
    }

    await prisma.subAccount.upsert({
      where: {
        mainAccountId_currentName: {
          mainAccountId: mainAccount.id,
          currentName: account.subAccountName,
        },
      },
      create: {
        mainAccountId: mainAccount.id,
        currentName: account.subAccountName,
        balance: account.balance,
      },
      update: {
        balance: account.balance,
      },
    });
  }

  // 残高履歴は scrapeBalanceHistory で処理するため、ここでは本日分のみ保存
  const today = todayJST();
  today.setHours(8, 0, 0, 0);
  const allSubAccounts = await prisma.subAccount.findMany({
    where: {
      mainAccount: {
        providerId,
      },
    },
  });

  for (const sa of allSubAccounts) {
    await prisma.balanceHistory.upsert({
      where: {
        subAccountId_date: {
          subAccountId: sa.id,
          date: today,
        },
      },
      create: {
        subAccountId: sa.id,
        date: today,
        balance: sa.balance,
      },
      update: {
        balance: sa.balance,
      },
    });
  }

  logger.info(
    { count: balances.length },
    "✅ Saved balance records to database.",
  );
}

/**
 * 取引明細をDBに保存する関数
 */
async function saveTransactionsToDatabase(
  transactions: Awaited<ReturnType<typeof scrapeTransactions>>,
  providerId: string,
) {
  logger.info("💾 Saving transactions to database...");
  const normalize = normalizeLoose;

  // 全 mainAccount を事前取得し、正規化名でマッチングするためのヘルパー
  const allMainAccountsFromDb = await prisma.mainAccount.findMany({
    where: { providerId },
    include: { subAccounts: true },
  });
  const findMainAccountByNormalizedName = (instName: string) =>
    allMainAccountsFromDb.find(
      ma =>
        normalizeInstitutionName(ma.label) ===
        normalizeInstitutionName(instName),
    ) || null;

  // 初回/追加時に備えて、取引明細から子口座候補を先に作成・更新する
  const candidateSubAccountsByInstitution = new Map<string, Set<string>>();
  for (const tx of transactions) {
    if (!candidateSubAccountsByInstitution.has(tx.institutionName)) {
      candidateSubAccountsByInstitution.set(tx.institutionName, new Set());
    }
    const bucket = candidateSubAccountsByInstitution.get(tx.institutionName);

    if (
      tx.subAccountName &&
      !isPlaceholderSubAccountName(tx.subAccountName) &&
      bucket
    ) {
      bucket.add(tx.subAccountName);
    }
    // 注意: transferFromSubAccount や transferToSubAccount は他の金融機関の口座である可能性が高いため、
    // 現在の tx.institutionName の子口座として登録してはいけません。
  }

  for (const [institutionName, subNames] of candidateSubAccountsByInstitution) {
    const mainAccount = findMainAccountByNormalizedName(institutionName);
    if (!mainAccount) continue;

    for (const subName of subNames) {
      const normalizedSubName = subName.trim();
      if (!normalizedSubName) continue;
      await prisma.subAccount.upsert({
        where: {
          mainAccountId_currentName: {
            mainAccountId: mainAccount.id,
            currentName: normalizedSubName,
          },
        },
        create: {
          mainAccountId: mainAccount.id,
          currentName: normalizedSubName,
          balance: 0,
        },
        update: {},
      });
    }
  }

  // 全金融機関の全子口座を取得（振替の相手先解決用）
  const allSubAccountsInDb = await prisma.subAccount.findMany({
    include: {
      mainAccount: { select: { id: true, label: true, providerId: true } },
    },
  });

  // 金融機関名から子口座リストへのマップを構築
  const subAccountsByInstitution = new Map<string, typeof allSubAccountsInDb>();
  for (const sa of allSubAccountsInDb) {
    const key = normalizeInstitutionName(sa.mainAccount.label);
    if (!subAccountsByInstitution.has(key)) {
      subAccountsByInstitution.set(key, []);
    }
    subAccountsByInstitution.get(key)?.push(sa);
  }

  // 取引明細の保存
  let savedCount = 0;
  const processedTransferIds = new Set<string>();

  const saveSingleTransaction = async (
    subAccountId: string,
    date: string,
    amount: number,
    desc: string,
    isTransfer = false,
  ) => {
    const txId = await generateTransactionId(subAccountId, date, amount, desc);
    try {
      await prisma.transaction.upsert({
        where: { id: txId },
        create: {
          id: txId,
          subAccountId,
          date: toUtcDateOnly(date),
          amount,
          desc,
          isTransfer,
        },
        update: {
          // 既存データのズレ（日付等）を同期時に補正する
          subAccountId,
          date: toUtcDateOnly(date),
          amount,
          desc,
          isTransfer,
        },
      });
      savedCount++;
    } catch (error) {
      logger.error({ err: error, txId }, "❌ Failed to save transaction.");
    }
  };

  const buildTransferPairs = async (mainAccountId: string) => {
    const unresolved = await prisma.transaction.findMany({
      where: {
        subAccount: { mainAccount: { id: mainAccountId } },
        isTransfer: false,
      },
      orderBy: [{ date: "asc" }, { amount: "asc" }],
    });

    const used = new Set<string>();
    for (let i = 0; i < unresolved.length; i++) {
      const a = unresolved[i];
      if (used.has(a.id) || a.amount === 0) continue;

      for (let j = i + 1; j < unresolved.length; j++) {
        const b = unresolved[j];
        if (used.has(b.id)) continue;
        if (a.id === b.id) continue;
        if (a.date.getTime() !== b.date.getTime()) continue;
        if (a.subAccountId === b.subAccountId) continue;
        if (a.amount + b.amount !== 0) continue;

        await prisma.transaction.update({
          where: { id: a.id },
          data: {
            isTransfer: true,
            linkedTransId: b.id,
          },
        });
        await prisma.transaction.update({
          where: { id: b.id },
          data: {
            isTransfer: true,
            linkedTransId: a.id,
          },
        });
        used.add(a.id);
        used.add(b.id);
        break;
      }
    }
  };

  // 全金融機関の子口座から振替元・振替先を検索するヘルパー関数
  const findSubAccountByName = (name: string, rawInfo: string) => {
    if (!name) return undefined;

    const normalizedRawInfo = normalize(rawInfo);

    // 1. 完全一致する子口座候補を抽出
    const exactMatches = allSubAccountsInDb.filter(
      sa => sa.currentName === name,
    );
    if (exactMatches.length > 0) {
      // 候補の中で、金融機関名(label)がrawInfoに含まれているものを優先的に探す
      const refined = exactMatches.find(sa =>
        normalizedRawInfo.includes(normalize(sa.mainAccount.label)),
      );
      return refined || exactMatches[0];
    }

    // 2. 部分一致 (文字数の長い順)
    const sortedAll = [...allSubAccountsInDb].sort(
      (a, b) => b.currentName.length - a.currentName.length,
    );
    const normalizedName = normalize(name);

    for (const sa of sortedAll) {
      const normalizedSaName = normalize(sa.currentName);
      if (normalizedRawInfo.includes(normalizedSaName)) {
        if (
          normalizedName.includes(normalizedSaName) ||
          name.includes(sa.currentName)
        ) {
          // 同名の子口座が複数ある場合に備え、該当する名前を持つ口座群から再絞り込み
          const sameNameMatches = sortedAll.filter(
            x => normalize(x.currentName) === normalizedSaName,
          );
          const refined = sameNameMatches.find(x =>
            normalizedRawInfo.includes(normalize(x.mainAccount.label)),
          );
          return refined || sa;
        }
      }
    }

    return undefined;
  };

  // API 由来の sub_account_id_hash と DB の SubAccount を事前に対応付ける
  const subAccountByHashHint = new Map<
    string,
    (typeof allSubAccountsInDb)[number]
  >();
  const findSubAccountByInstitutionAndName = (
    institutionName: string,
    subAccountName: string,
  ) => {
    if (!institutionName || !subAccountName) return undefined;
    return allSubAccountsInDb.find(
      sa =>
        normalizeInstitutionName(sa.mainAccount.label) ===
          normalizeInstitutionName(institutionName) &&
        sa.currentName === subAccountName,
    );
  };

  for (const tx of transactions) {
    const hash = (tx as { subAccountIdHash?: string }).subAccountIdHash;
    if (hash && !subAccountByHashHint.has(hash)) {
      const matched = allSubAccountsInDb.find(
        sa =>
          sa.currentName === tx.subAccountName &&
          normalizeInstitutionName(sa.mainAccount.label) ===
            normalizeInstitutionName(tx.institutionName),
      );
      if (matched) {
        subAccountByHashHint.set(hash, matched);
      }
    }
    const partnerHash = (tx as { partnerSubAccountIdHash?: string })
      .partnerSubAccountIdHash;
    const partnerInstitutionName = (tx as { partnerInstitutionName?: string })
      .partnerInstitutionName;
    const partnerSubAccountName = (tx as { partnerSubAccountName?: string })
      .partnerSubAccountName;
    if (
      partnerHash &&
      !subAccountByHashHint.has(partnerHash) &&
      partnerInstitutionName &&
      partnerSubAccountName
    ) {
      const matchedPartner = findSubAccountByInstitutionAndName(
        partnerInstitutionName,
        partnerSubAccountName,
      );
      if (matchedPartner) {
        subAccountByHashHint.set(partnerHash, matchedPartner);
      }
    }
  }

  const resolveSubAccountByHash = (hash?: string) =>
    hash ? subAccountByHashHint.get(hash) : undefined;

  for (const tx of transactions) {
    // 振替取引の場合、両方の子口座に記録
    if (tx.isTransfer) {
      // 同じ振替を重複処理しないようにチェック
      const transferKey = `${tx.date}-${tx.msgUrlId}`;
      const robustTransferKey = tx.msgUrlId
        ? transferKey
        : `${tx.institutionName}-${tx.date}-${tx.amount}-${tx.subAccountName}-${tx.desc}`;
      if (processedTransferIds.has(robustTransferKey)) {
        continue;
      }
      processedTransferIds.add(robustTransferKey);

      const rawInfo = (tx as { rawInfo?: string }).rawInfo ?? "";
      const transferMatch = rawInfo.match(/(.+?)から(.+?)への振替/);

      let fromSubAccount: (typeof allSubAccountsInDb)[number] | undefined;
      let toSubAccount: (typeof allSubAccountsInDb)[number] | undefined;

      // まずは API のハッシュ情報で解決する
      const hashedCurrent = resolveSubAccountByHash(
        (tx as { subAccountIdHash?: string }).subAccountIdHash,
      );
      const hashedPartner = resolveSubAccountByHash(
        (tx as { partnerSubAccountIdHash?: string }).partnerSubAccountIdHash,
      );
      const hintedCurrent = findSubAccountByInstitutionAndName(
        tx.institutionName,
        tx.subAccountName,
      );
      const hintedPartner = findSubAccountByInstitutionAndName(
        (tx as { partnerInstitutionName?: string }).partnerInstitutionName ??
          "",
        (tx as { partnerSubAccountName?: string }).partnerSubAccountName ?? "",
      );

      if (hashedCurrent && hashedPartner) {
        if (tx.amount < 0) {
          fromSubAccount = hashedCurrent;
          toSubAccount = hashedPartner;
        } else {
          fromSubAccount = hashedPartner;
          toSubAccount = hashedCurrent;
        }
      } else if (hashedCurrent && hintedPartner) {
        if (tx.amount < 0) {
          fromSubAccount = hashedCurrent;
          toSubAccount = hintedPartner;
        } else {
          fromSubAccount = hintedPartner;
          toSubAccount = hashedCurrent;
        }
      } else if (hintedCurrent && hintedPartner) {
        if (tx.amount < 0) {
          fromSubAccount = hintedCurrent;
          toSubAccount = hintedPartner;
        } else {
          fromSubAccount = hintedPartner;
          toSubAccount = hintedCurrent;
        }
      }

      if ((!fromSubAccount || !toSubAccount) && transferMatch) {
        const fromPart = transferMatch[1];
        const toPart = transferMatch[2];

        // 全金融機関の子口座から振替元・振替先を検索
        fromSubAccount = findSubAccountByName(
          tx.transferFromSubAccount ?? "",
          fromPart,
        );
        toSubAccount = findSubAccountByName(
          tx.transferToSubAccount ?? "",
          toPart,
        );

        // スクレイピング時に特定された名前でも再検索
        if (!fromSubAccount && tx.transferFromSubAccount) {
          fromSubAccount = allSubAccountsInDb.find(
            sa => sa.currentName === tx.transferFromSubAccount,
          );
        }
        if (!toSubAccount && tx.transferToSubAccount) {
          toSubAccount = allSubAccountsInDb.find(
            sa => sa.currentName === tx.transferToSubAccount,
          );
        }
      } else if (!fromSubAccount || !toSubAccount) {
        // rawInfo がない場合は、スクレイピング時の情報を使用
        if (tx.transferFromSubAccount) {
          fromSubAccount = allSubAccountsInDb.find(
            sa => sa.currentName === tx.transferFromSubAccount,
          );
        }
        if (tx.transferToSubAccount) {
          toSubAccount = allSubAccountsInDb.find(
            sa => sa.currentName === tx.transferToSubAccount,
          );
        }
      }

      // 振替先/元が解決できない場合は保存しない（不正確な単独明細を残さない）
      if (!fromSubAccount || !toSubAccount) {
        logger.warn(
          {
            sub: tx.subAccountName,
            from: tx.transferFromSubAccount ?? "?",
            to: tx.transferToSubAccount ?? "?",
            msgId: tx.msgUrlId,
          },
          "⚠️ Transfer unresolved and skipped.",
        );
        continue;
      }

      const absAmount = Math.abs(tx.amount);
      const fromName = fromSubAccount.currentName;
      const toName = toSubAccount.currentName;
      const transferDesc = `振替: ${fromName} → ${toName}`;

      // 振替の両方の記録をアトミックに処理
      try {
        const currentVisibleSideAccount = hintedCurrent ?? hashedCurrent;
        const obsoleteVisibleTxId = currentVisibleSideAccount
          ? await generateTransactionId(
              currentVisibleSideAccount.id,
              tx.date,
              tx.amount,
              tx.desc,
            )
          : null;

        const fromTxId = await generateTransactionId(
          fromSubAccount.id,
          tx.date,
          -absAmount,
          transferDesc,
        );
        const toTxId = await generateTransactionId(
          toSubAccount.id,
          tx.date,
          absAmount,
          transferDesc,
        );

        await prisma.$transaction(async txPrisma => {
          if (obsoleteVisibleTxId) {
            await txPrisma.transaction.deleteMany({
              where: {
                id: obsoleteVisibleTxId,
                isTransfer: false,
              },
            });
          }

          // 振替元に出金を記録
          await txPrisma.transaction.upsert({
            where: { id: fromTxId },
            create: {
              id: fromTxId,
              subAccountId: fromSubAccount.id,
              date: toUtcDateOnly(tx.date),
              amount: -absAmount,
              desc: transferDesc,
              isTransfer: true,
              linkedTransId: toTxId,
            },
            update: {
              subAccountId: fromSubAccount.id,
              date: toUtcDateOnly(tx.date),
              amount: -absAmount,
              desc: transferDesc,
              isTransfer: true,
              linkedTransId: toTxId,
            },
          });

          // 振替先に入金を記録
          await txPrisma.transaction.upsert({
            where: { id: toTxId },
            create: {
              id: toTxId,
              subAccountId: toSubAccount.id,
              date: toUtcDateOnly(tx.date),
              amount: absAmount,
              desc: transferDesc,
              isTransfer: true,
              linkedTransId: fromTxId,
            },
            update: {
              subAccountId: toSubAccount.id,
              date: toUtcDateOnly(tx.date),
              amount: absAmount,
              desc: transferDesc,
              isTransfer: true,
              linkedTransId: fromTxId,
            },
          });
        });

        savedCount += 2;

        // 金融機関が異なる場合は明示
        const fromInst = fromSubAccount.mainAccount.label;
        const toInst = toSubAccount.mainAccount.label;
        const crossInstitution =
          fromInst !== toInst ? ` (${fromInst} → ${toInst})` : "";
        logger.info(
          {
            from: fromName,
            to: toName,
            crossInstitution,
            amount: absAmount.toLocaleString(),
          },
          "✅ Transfer recorded.",
        );
      } catch (error) {
        logger.error(
          { err: error, date: tx.date, from: fromName, to: toName },
          "❌ Failed to save transfer.",
        );
      }
      continue;
    }

    // 通常の取引（振替でない、または振替情報が不完全な場合）
    // 正規化名で mainAccount をマッチし、その子口座から subAccount を検索
    const matchedMainAccount = findMainAccountByNormalizedName(
      tx.institutionName,
    );
    let subAccount =
      resolveSubAccountByHash(
        (tx as { subAccountIdHash?: string }).subAccountIdHash,
      ) ??
      (matchedMainAccount
        ? (matchedMainAccount.subAccounts.find(
            sa => sa.currentName === tx.subAccountName,
          ) ??
          matchedMainAccount.subAccounts.find(
            sa => normalize(sa.currentName) === normalize(tx.subAccountName),
          ))
        : null);

    if (!subAccount) {
      logger.warn(
        {
          institution: tx.institutionName,
          subAccount: tx.subAccountName,
          msgId: tx.msgUrlId,
        },
        "⚠️ Unmatched transaction not found in DB.",
      );
      // Debug info: 正規化名でマッチした mainAccount を使用
      const ma = matchedMainAccount;
      if (ma) {
        logger.debug(
          {
            subAccounts: ma.subAccounts
              .map(s => `"${s.currentName}"`)
              .join(", "),
          },
          "   Available DB subAccounts.",
        );
        // フォールバック1: MF側で "Main" になった場合、子口座が1つならそこへ紐付ける
        if (
          isPlaceholderSubAccountName(tx.subAccountName) &&
          ma.subAccounts.length === 1
        ) {
          subAccount = ma.subAccounts[0];
          logger.debug(
            { subAccount: subAccount.currentName },
            "   Fallback matched to the only sub account.",
          );
        }

        // フォールバック2: Main で子口座が複数の場合は、明細説明文から既存子口座を推定
        if (!subAccount && isPlaceholderSubAccountName(tx.subAccountName)) {
          const sortedCandidates = [...ma.subAccounts].sort(
            (a, b) => b.currentName.length - a.currentName.length,
          );
          const matched = sortedCandidates.filter(sa =>
            tx.desc.includes(sa.currentName),
          );
          if (matched.length === 1) {
            subAccount = matched[0];
            logger.debug(
              { subAccount: subAccount.currentName },
              "   Fallback matched by description.",
            );
          } else {
            // 振替でない明細も含め、正規化文字列で再推定
            const rawInfo = (tx as { rawInfo?: string }).rawInfo ?? "";
            const normalizedText = normalize(`${tx.desc} ${rawInfo}`);
            const normalizedMatched = sortedCandidates.filter(sa =>
              normalizedText.includes(normalize(sa.currentName)),
            );
            if (normalizedMatched.length === 1) {
              subAccount = normalizedMatched[0];
              logger.debug(
                { subAccount: subAccount.currentName },
                "   Fallback matched by normalized text.",
              );
            } else {
              logger.debug(
                `   Skip creating "Main": could not uniquely resolve existing sub account`,
              );
            }
          }
        }
        // フォールバック3: Main 以外でも正規化文字列から一意推定
        if (!subAccount) {
          const sortedCandidates = [...ma.subAccounts].sort(
            (a, b) => b.currentName.length - a.currentName.length,
          );
          const rawInfo = (tx as { rawInfo?: string }).rawInfo ?? "";
          const normalizedText = normalize(
            `${tx.subAccountName} ${tx.desc} ${rawInfo}`,
          );
          const normalizedMatched = sortedCandidates.filter(sa =>
            normalizedText.includes(normalize(sa.currentName)),
          );
          if (normalizedMatched.length === 1) {
            subAccount = normalizedMatched[0];
            logger.debug(
              { subAccount: subAccount.currentName },
              "   Fallback matched by normalized text.",
            );
          }
        }
      } else {
        logger.warn(
          { institution: tx.institutionName },
          "   MainAccount not found either.",
        );
      }
    }

    if (!subAccount) {
      // スキップされたトランザクションを詳細にログ出力
      logger.warn(
        {
          institution: tx.institutionName,
          subAccount: tx.subAccountName,
          date: tx.date,
          desc: tx.desc,
          amount: tx.amount,
          msgId: tx.msgUrlId,
        },
        "⚠️ TRANSACTION SKIPPED: Could not match any account.",
      );
      continue;
    }

    await saveSingleTransaction(
      subAccount.id,
      tx.date,
      tx.amount,
      tx.desc,
      false,
    );
  }

  // 3.5 新規口座追加時にも既存明細の振替関係を再構築する
  const providerMainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: { id: true },
  });
  for (const ma of providerMainAccounts) {
    await buildTransferPairs(ma.id);
  }

  // 4. カテゴリ分類ルールの適用（大文字小文字を区別しない）
  const rules = await prisma.categoryRule.findMany({
    orderBy: { priority: "desc" },
  });

  for (const rule of rules) {
    await prisma.transaction.updateMany({
      where: {
        desc: { contains: rule.keyword, mode: "insensitive" },
        subCategoryId: null,
      },
      data: {
        subCategoryId: rule.subCategoryId,
      },
    });
  }

  logger.info(
    { saved: savedCount, total: transactions.length },
    "✅ Saved transactions to database.",
  );
}

// アクティブなブラウザインスタンスを追跡（中止用）
const activeBrowsers = new Map<
  string,
  {
    browser: ReturnType<typeof chromium.launch> extends Promise<infer T>
      ? T
      : never;
    providerId: string;
  }
>();

/**
 * 指定されたプロバイダーのスクレイパーを中止する
 */
export async function abortMfScraper(providerId: string) {
  logger.info({ providerId }, "🛑 Attempting to abort scraper for provider.");
  const entry = Array.from(activeBrowsers.values()).find(
    e => e.providerId === providerId,
  );
  if (entry) {
    try {
      await entry.browser.close();
      logger.info({ providerId }, "✅ Browser closed for provider.");
    } catch (err) {
      logger.error(
        { err, providerId },
        "⚠️ Error closing browser for provider.",
      );
    }
  }
}

export interface MfScraperOptions {
  mode: "scheduled" | "manual";
}

/**
 * スクレイパーのメイン処理
 */
export async function runMfScraper(
  providerName: string,
  signal?: AbortSignal,
  options: MfScraperOptions = { mode: "scheduled" },
) {
  logger.info("🚀 Starting MF Scraper...");
  logger.info({ providerName }, "📦 Using 1Password item.");

  let provider = await prisma.provider.findFirst({
    where: { name: providerName },
  });

  if (!provider) {
    provider = await prisma.provider.create({
      data: {
        name: providerName,
        type: "mf",
        isActive: true,
      },
    });
  }

  const { email, password } = getCredentials(providerName);

  const browser = await chromium.launch({ headless: true });

  // ブラウザを追跡マップに登録
  activeBrowsers.set(provider.id, { browser, providerId: provider.id });

  // シグナルが既に中止されていたらすぐに終了
  if (signal?.aborted) {
    await browser.close();
    activeBrowsers.delete(provider.id);
    throw new Error("Sync was aborted before starting");
  }

  // 中止シグナルのリスナーを設定
  const abortHandler = async () => {
    logger.info("🛑 Abort signal received, closing browser...");
    try {
      await browser.close();
    } catch {
      // ブラウザが既に閉じられている場合は無視
    }
  };
  signal?.addEventListener("abort", abortHandler);

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  try {
    logger.info("🔐 Logging in to MoneyForward...");
    await page.goto("https://moneyforward.com/sign_in");

    if (!page.url().includes("id.moneyforward.com")) {
      logger.debug({ url: page.url() }, "Current URL.");
    }

    try {
      await page.waitForSelector('input[name="mfid_user[email]"]', {
        timeout: 20000,
      });
    } catch {
      logger.error({ url: page.url() }, "❌ Login form not found.");
      throw new Error("Login form not found");
    }
    logger.info("📧 Submitting email...");
    await page.fill('input[name="mfid_user[email]"]', email);
    await page.click("button#submitto");

    logger.info("⏳️ Waiting for password field...");
    await page.waitForSelector('input[name="mfid_user[password]"]');
    logger.info("🔑 Submitting password...");
    await page.fill('input[name="mfid_user[password]"]', password);
    await page.click("button#submitto");

    const otpInputFound = await page
      .locator('input[name="otp_attempt"]')
      .count();
    logger.info({ otpInputFound }, "🔑 Checking for OTP input field...");

    if (otpInputFound > 0) {
      logger.info("🔑 Entering OTP (fetching fresh token)...");
      const currentOtp = getItemOtp(providerName);
      logger.info({ currentOtp }, "🔑 OTP code generated.");

      await page.fill('input[name="otp_attempt"]', currentOtp);
      const filledValue = await page.inputValue('input[name="otp_attempt"]');
      logger.info(
        {
          filledValue,
          expected: currentOtp,
          match: filledValue === currentOtp,
        },
        "🔑 OTP input verified.",
      );

      await page.click("button#submitto");
      // MoneyForwardの2FAはSPA的挙動でページ遷移しないため、
      // 単に時間を待ってからログイン状態を再検証する
      await page.waitForTimeout(8000);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    } else {
      logger.debug("ℹ️ No OTP input field found, skipping OTP step.");
    }

    // ログイン成功確認要素（ログアウトリンク）— SPA遷移で実行コンテキストが
    // 破棄される場合があるため、リトライ付きで検証する
    async function verifyLoggedIn(): Promise<boolean> {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          const result = await page.evaluate(() => {
            return document.querySelector('a[href="/sign_out"]') !== null;
          });
          return result;
        } catch {
          await page.waitForTimeout(2000);
          await page.waitForLoadState("domcontentloaded").catch(() => {});
        }
      }
      return false;
    }
    let isLoggedIn = await verifyLoggedIn();

    if (!isLoggedIn) {
      const currentUrl = page.url();
      const title = await page.title();
      const bodyText = await page.evaluate(
        () => document.body?.innerText?.slice(0, 500) ?? "",
      );
      const buttons = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            'button, input[type="submit"], a[role="button"]',
          ),
        ).map(el => ({
          text: el.textContent?.trim(),
          className: el.className,
          href: el.getAttribute("href"),
          type: el.getAttribute("type"),
        })),
      );
      logger.error(
        { currentUrl, title, bodyText, buttons },
        "❌ Login verification failed.",
      );

      // two_factor_auth ページでエラーメッセージが表示されている場合、
      // OTPコードが期限切れの可能性がある。再試行する
      if (
        currentUrl.includes("two_factor_auth") &&
        bodyText.includes("コードが間違っています")
      ) {
        logger.warn(
          "⚠️ OTP code expired or incorrect. Retrying with fresh code...",
        );
        for (let attempt = 0; attempt < 2; attempt++) {
          const freshOtp = getItemOtp(providerName);
          logger.info(
            { freshOtp, attempt },
            "🔑 Fresh OTP code generated for retry.",
          );

          const otpInput = page.locator('input[name="otp_attempt"]');
          if ((await otpInput.count()) > 0) {
            await otpInput.fill(freshOtp);
            await page.click("button#submitto");
            await page.waitForTimeout(10000);

            isLoggedIn = await verifyLoggedIn();
            if (isLoggedIn) {
              logger.info("✅ Login verification passed on retry.");
              break;
            }
          }
        }

        if (!isLoggedIn) {
          const retryUrl = page.url();
          const retryTitle = await page.title();
          const retryBody = await page.evaluate(
            () => document.body?.innerText?.slice(0, 500) ?? "",
          );
          logger.error(
            { currentUrl: retryUrl, title: retryTitle, bodyText: retryBody },
            "❌ Login verification failed after all retries.",
          );
        }
      }

      if (!isLoggedIn) {
        throw new Error(
          `Login verification failed: User appears not to be logged in. (current page: ${currentUrl}, title: ${title})`,
        );
      }
    }

    logger.info("✅ Logged in successfully (verified).");

    if (options.mode === "scheduled") {
      await triggerSync(page, provider.id);

      logger.info("⏳️ Waiting for sync to complete (max 60 min)...");
      const startTime = Date.now();
      const timeout = 60 * 60 * 1000;

      while (Date.now() - startTime < timeout) {
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(5000);

        const loadingIcons = page.locator('img[src*="loading"]:visible');
        const count = await loadingIcons.count();

        if (count === 0) {
          logger.info("✅ All syncs completed.");
          break;
        }
        logger.info({ count }, "🔄 Still syncing... accounts updating.");
        await page.waitForTimeout(10000);
      }
    } else {
      logger.info(
        "ℹ️ Manual mode: skipping MF update button flow, starting API fetch immediately.",
      );
    }

    // Phase 1: 全金融機関の残高をスクレイプし、子口座をDBに登録
    logger.info("Phase 1: Scraping balances and registering sub-accounts...");
    const balances = await scrapeBalances(page, provider.id);

    // 残高データから子口座を先にDBに登録
    await saveBalancesToDatabase(balances, provider.id);

    // Phase 2: 全金融機関の全子口座名を収集
    logger.info("📋 Phase 2: Collecting all sub-account names from DB...");
    const allMainAccounts = await prisma.mainAccount.findMany({
      include: { subAccounts: { select: { currentName: true } } },
    });
    const allSubAccountNames = new Map<string, string[]>();
    for (const ma of allMainAccounts) {
      const key = normalizeInstitutionName(ma.label);
      const existing = allSubAccountNames.get(key) ?? [];
      const names = ma.subAccounts.map(sa => sa.currentName);
      allSubAccountNames.set(key, [...new Set([...existing, ...names])]);
    }
    logger.info(
      {
        institutions: allMainAccounts.length,
        subAccounts: Array.from(allSubAccountNames.values()).flat().length,
      },
      "✅ Found institutions with sub-accounts.",
    );

    // Phase 3: 入出金明細・振替をスクレイプ（全子口座情報を使用）
    logger.info(
      "Phase 3: Scraping transactions with full sub-account knowledge...",
    );
    const transactions = await scrapeTransactions(
      page,
      provider.id,
      balances,
      allSubAccountNames,
      options,
    );

    // Phase 4: 取引明細をDBに保存
    logger.info("📋 Phase 4: Saving transactions to database...");
    await saveTransactionsToDatabase(transactions, provider.id);

    // Phase 5: 残高履歴を過去から取得
    logger.info("📋 Phase 5: Scraping balance history...");
    await scrapeBalanceHistory(page, options);

    logger.info("🎉 MF Scraping process completed successfully!");
  } catch (error) {
    logger.error({ err: error }, "❌ Scraping process failed.");
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
    activeBrowsers.delete(provider.id);
    await browser.close();
    await prisma.$disconnect();
  }
}

// 直接実行された場合の処理
if (isEntry && process.env.OP_MF_ITEM_ID) {
  runMfScraper(process.env.OP_MF_ITEM_ID).catch(err => {
    logger.error({ err }, "Failed to run MF scraper directly.");
    process.exit(1);
  });
}
