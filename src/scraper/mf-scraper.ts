import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SubAccount } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { generateTransactionId } from "../lib/hash";
import logger from "../lib/logger";
import { getItemField, getItemOtp } from "../lib/onepassword";
import { prisma } from "../lib/prisma";
import { acquireSyncLock, releaseSyncLock } from "../lib/sync-lock";
import { BACKFILL_START_DATE, formatJSTDate, todayJST } from "../lib/utils";

// エントリポイント（直接実行）のみ自動スクレイピングを許可
const isEntry =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].endsWith("mf-scraper.ts") ||
    process.argv[1].endsWith("mf-scraper.js"));

const normalizeInstitutionName = (name: string) =>
  name.split(/[（(]/)[0].replace(/\s+/g, " ").trim();

const toUtcDateOnly = (ymd: string) => {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

// MF API の日時の形式は確かめられていない．時差付き（Z や +09:00）なら JST の日付に直す．
// 先頭 10 文字を切り取るだけだと，UTC 表記の値で日付が 1 日前にずれる．
// 日付だけや時差のない日時は new Date がローカル TZ で解釈するので，変換せず先頭 10 文字を使う
const MF_DATETIME_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const toJstDateString = (value: string) => {
  if (MF_DATETIME_WITH_OFFSET.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return formatJSTDate(date);
  }
  return value.slice(0, 10);
};

// 請求の content は「YYYY/MM/DD お支払い分」の形で，先頭が支払日である．
// updated_at も 2026-10 時点では支払日と同じ値だが，名前からは更新日時に読め，変わると一意キー
// (subAccountId, billingDate) がずれて同じ請求が別の行になるので，content の日付を優先する
const BILLING_CONTENT_DATE = /^(\d{4})\/(\d{2})\/(\d{2})/;
const retrieveBillingDateString = (act: {
  content: string;
  updated_at: string;
}) => {
  const match = act.content?.trim().match(BILLING_CONTENT_DATE);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return toJstDateString(act.updated_at);
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

type MfLiabilitiesResponse = {
  accounts?: Array<{
    service_id: number;
    disp_name: string | null;
    account_id_hash: string;
    category_type: string;
    category_name: string;
    service: {
      service_type: string;
      service_name: string;
      disp_order: number;
      yomigana: string;
      color_code: string;
    };
    sub_accounts?: Array<{
      sub_name: string | null;
      sub_type: string;
      sub_number: string | null;
      disp_name: string | null;
      user_asset_acts?: Array<{
        content: string;
        amount: number;
        currency: string;
        jpyrate: number;
        updated_at: string;
      }>;
      asset_classes?: Array<{
        asset_class_type: string;
        asset_class_name: string;
        asset_subclasses?: Array<{
          asset_subclass_type: string;
          asset_subclass_name: string;
          user_asset_sums?: Array<{
            value: number;
            currency: string;
            jpyrate: number;
          }>;
        }>;
      }>;
    }>;
  }>;
};

/**
 * MoneyForward のクレジットカード請求情報 (/sp2/liabilities) を取得する
 */
async function fetchLiabilities(page: Page): Promise<MfLiabilitiesResponse> {
  return fetchJson<MfLiabilitiesResponse>(
    page,
    "https://moneyforward.com/sp2/liabilities",
  );
}

/**
 * 同期 1 回の中で，例外を握りつぶして処理を続けた件数を種類ごとに数える．
 * 続けられる失敗でも，1 件でもあれば runMfScraper が最後に例外を投げ，同期を失敗として記録する．
 * 同時に複数のプロバイダーを同期することがあるので，モジュールの変数ではなく同期ごとに作って渡す
 */
type SyncFailureCounts = Map<string, number>;

function countSyncFailure(failures: SyncFailureCounts, kind: string) {
  failures.set(kind, (failures.get(kind) ?? 0) + 1);
}

/**
 * クレジットカードの請求データを DB に保存する
 */
async function saveCreditCardBillings(
  liabilities: MfLiabilitiesResponse,
  providerId: string,
  failures: SyncFailureCounts,
) {
  const accounts = liabilities.accounts ?? [];
  if (accounts.length === 0) {
    logger.info("ℹ️ No liability accounts found for billing data.");
    return;
  }

  logger.info(
    { accountCount: accounts.length },
    "💳 Processing credit card billing data...",
  );

  // 対象プロバイダーの mainAccount を取得
  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: { id: true, label: true },
  });

  const targetLabels = new Set(
    mainAccounts.map(ma => normalizeInstitutionName(ma.label)),
  );

  let totalBillingsSaved = 0;

  for (const account of accounts) {
    // プロバイダーマッチ
    const serviceName = normalizeInstitutionName(account.service.service_name);
    if (!targetLabels.has(serviceName)) continue;

    const mainAccount = mainAccounts.find(
      ma => normalizeInstitutionName(ma.label) === serviceName,
    );
    if (!mainAccount) continue;

    const subAccounts = account.sub_accounts ?? [];
    for (const subAccount of subAccounts) {
      // user_asset_acts がない場合はスキップ
      const acts = subAccount.user_asset_acts ?? [];
      if (acts.length === 0) continue;

      // subAccount を DB から取得（LIABILITY 类型のものを対象）
      const subAccountName = buildSubAccountMergeName(
        subAccount.sub_type,
        subAccount.sub_name ?? "",
      );
      const dbSubAccount = await prisma.subAccount.findFirst({
        where: {
          mainAccountId: mainAccount.id,
          currentName: subAccountName,
          assetType: "LIABILITY",
        },
      });
      if (!dbSubAccount) continue;

      // 各請求データを upsert
      for (const act of acts) {
        const amount = Math.trunc(act.amount);
        const billingDate = toUtcDateOnly(retrieveBillingDateString(act));

        try {
          await prisma.creditCardBilling.upsert({
            where: {
              subAccountId_billingDate: {
                subAccountId: dbSubAccount.id,
                billingDate,
              },
            },
            create: {
              subAccountId: dbSubAccount.id,
              billingDate,
              amount,
              content: act.content?.trim() || null,
            },
            update: {
              amount,
              content: act.content?.trim() || null,
            },
          });
          totalBillingsSaved++;
        } catch (error) {
          logger.warn(
            {
              err: error,
              subAccount: subAccountName,
              billingDate,
              updatedAt: act.updated_at,
              amount,
            },
            "⚠️ Failed to save credit card billing record.",
          );
          countSyncFailure(failures, "creditCardBilling");
        }
      }
    }
  }

  logger.info(
    { count: totalBillingsSaved },
    "✅ Credit card billing data saved.",
  );
}

async function fetchAccountSummaries(page: Page): Promise<MfAccountSummary[]> {
  const payload = await fetchJson<{ accounts?: MfAccountSummary[] }>(
    page,
    "https://moneyforward.com/sp2/account_summaries",
  );
  return payload.accounts ?? [];
}

type MfAssetDetail = {
  asset_class_id: number;
  asset_subclass_id: number;
  code?: string | null;
  name: string | null;
  qty?: number | null;
  entried_price?: number | null;
  current_price?: number | null;
  value?: number | null;
  profit?: number | null;
  entried_at?: string | null;
  expire_at?: string | null;
  cost?: string | null;
  currency?: string | null;
  jpyrate?: number | null;
  interest?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  extra?: unknown | null;
};

type MfAccountDetailPageData = {
  account?: {
    id: string;
    account_id_hash: string;
    display_name: string;
    sub_accounts?: Array<{
      id: string;
      sub_account_id_hash: string;
      sub_type: string;
      is_dummy: boolean;
    }>;
    grouped_asset_details_by_asset_classes?: Array<{
      asset_class_type: string;
      asset_class_name: string;
      asset_subclasses?: Array<{
        asset_subclass_type: string;
        asset_subclass_name: string;
        asset_details: MfAssetDetail[];
      }>;
    }>;
  };
};

/**
 * アカウント詳細ページ（/sp2/accounts/{show_account_id}）から
 * grouped_asset_details_by_asset_classes を取得する
 */
async function fetchAccountHoldingsPage(
  page: Page,
  showAccountId: string,
): Promise<MfAccountDetailPageData | null> {
  const url = `https://moneyforward.com/sp2/accounts/${showAccountId}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

  // page.content() の HTML から正規表現で抜き出すと，`&` が `&amp;` のまま残り
  // 銘柄名が変わって別の Holding 行が作られる．DOM の textContent は実体参照を戻した文字列を返す
  const pre = page.locator("pre").first();
  if ((await pre.count()) === 0) return null;
  const jsonText = await pre.textContent();
  if (!jsonText) return null;

  try {
    const data = JSON.parse(jsonText) as MfAccountDetailPageData;
    return data;
  } catch {
    return null;
  }
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
  user_asset_dets?: {
    MF?: Array<{
      code?: string | null;
      name?: string | null;
      qty?: number | null;
      entried_price?: number | null;
      current_price?: number | null;
      value?: number | null;
      profit?: number | null;
      entried_at?: string | null;
      expire_at?: string | null;
      cost?: string | null;
      currency?: string | null;
      jpyrate?: number | null;
      interest?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
      extra?: unknown | null;
      asset_detail_id_hash?: string | null;
      account_name?: string | null;
      sub_account_name?: string | null;
      is_manual?: boolean | null;
      is_wallet?: boolean | null;
      is_manual_em?: boolean | null;
      sub_account_id_hash?: string | null;
    }>;
  };
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
  range: number | "all",
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
 * アカウント詳細ページから投資信託の保有銘柄データを取得して DB に保存する
 */
async function saveHoldingsFromAccountPage(
  subAccountId: string,
  subAccountName: string,
  assetDetails: MfAssetDetail[],
  date: string,
  failures: SyncFailureCounts,
) {
  logger.info(
    { holdingsCount: assetDetails.length, subAccount: subAccountName },
    "💼 Saving investment trust holdings...",
  );

  let savedCount = 0;
  const today = toUtcDateOnly(date);

  for (const holding of assetDetails) {
    const holdingName = holding.name?.trim();
    if (!holdingName) continue;

    const qty = holding.qty ?? 0;
    // unitPrice，valuation，gainLoss は Int 列である．小数のまま渡すと Prisma が例外を出し，銘柄が保存されない
    const unitPrice = Math.round(holding.current_price ?? 0);
    const valuation = Math.round(holding.value ?? 0);
    const profit = Math.round(holding.profit ?? 0);
    // Derive total cost from valuation and profit for gainLossRate calculation.
    // valuation = profit + totalCost => totalCost = valuation - profit
    const derivedTotalCost = valuation - profit;
    const avgCostBasis = qty > 0 ? Math.round(derivedTotalCost / qty) : 0;
    const gainLossRate =
      derivedTotalCost > 0
        ? Number(((profit / derivedTotalCost) * 100).toFixed(4))
        : 0;

    try {
      await prisma.$transaction(async tx => {
        await tx.holding.upsert({
          where: {
            subAccountId_name: {
              subAccountId,
              name: holdingName,
            },
          },
          create: {
            subAccountId,
            name: holdingName,
            quantity: qty,
            avgCostBasis,
            unitPrice,
            valuation,
            gainLoss: profit,
            gainLossRate,
            dayBeforeRatio: 0,
          },
          update: {
            quantity: qty,
            avgCostBasis,
            unitPrice,
            valuation,
            gainLoss: profit,
            gainLossRate,
            updatedAt: new Date(),
          },
        });

        // 同じ日に 2 回同期すると @@unique([subAccountId, name, date]) に当たる．
        // create ではトランザクション全体（holding の更新を含む）が巻き戻るため upsert にする
        const historyValues = {
          quantity: qty,
          avgCostBasis,
          unitPrice,
          valuation,
          gainLoss: profit,
          gainLossRate,
        };
        await tx.holdingHistory.upsert({
          where: {
            subAccountId_name_date: {
              subAccountId,
              name: holdingName,
              date: today,
            },
          },
          create: {
            subAccountId,
            name: holdingName,
            date: today,
            ...historyValues,
          },
          update: historyValues,
        });
      });
      savedCount++;
    } catch (error) {
      logger.warn(
        { err: error, name: holdingName, subAccount: subAccountName },
        "⚠️ Failed to save holding history.",
      );
      countSyncFailure(failures, "holding");
    }
  }

  // 今回のページにない銘柄（売却済み）を消す．残すと最後の評価額のまま資産に計上され続ける．
  // 履歴（HoldingHistory）は過去の推移として残す
  const currentNames = assetDetails
    .map(holding => holding.name?.trim())
    .filter((name): name is string => Boolean(name));
  const { count: removedCount } = await prisma.holding.deleteMany({
    where: { subAccountId, name: { notIn: currentNames } },
  });

  logger.info(
    { count: savedCount, removed: removedCount, subAccount: subAccountName },
    "✅ Holdings saved from account detail page.",
  );
}

/**
 * 投資信託の保有銘柄履歴（HoldingHistory）について、各日の valuation と gainLoss から
 * totalCost = valuation - gainLoss を逆算し、gainLossRate と avgCostBasis を再計算する。
 * 対象は指定した子口座だけにし，値が変わる行だけを更新する（証券口座ごとに呼ばれるので，全件を毎回書き直さない）
 */
async function recalculateHoldingHistory(subAccountId: string) {
  const allHistories = await prisma.holdingHistory.findMany({
    where: { subAccountId },
    select: {
      id: true,
      subAccountId: true,
      name: true,
      quantity: true,
      valuation: true,
      gainLoss: true,
      avgCostBasis: true,
      gainLossRate: true,
    },
  });

  if (allHistories.length === 0) return 0;

  let updatedCount = 0;
  for (const h of allHistories) {
    const derivedTotalCost = h.valuation - h.gainLoss;
    if (derivedTotalCost <= 0) continue;
    const newGainLossRate = Number(
      ((h.gainLoss / derivedTotalCost) * 100).toFixed(4),
    );
    const newAvgCostBasis =
      h.quantity > 0 ? Math.round(derivedTotalCost / h.quantity) : 0;
    if (
      h.avgCostBasis === newAvgCostBasis &&
      h.gainLossRate === newGainLossRate
    ) {
      continue;
    }

    await prisma.holdingHistory.update({
      where: { id: h.id },
      data: {
        avgCostBasis: newAvgCostBasis,
        gainLossRate: newGainLossRate,
      },
    });
    updatedCount++;
  }

  logger.info({ count: updatedCount }, "🔄 HoldingHistory recalculated.");
  return updatedCount;
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

// scrapeTransactions が返す明細 1 件．変換を関数に切り出したため，
// 戻り値からの推論ではなく明示的に定義する（推論にすると型が循環する）
type ScrapedTransaction = {
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
  // raw API data for debugging unresolved transfers
  rawApiData?: Record<string, unknown>;
};

type MfUserAssetAct = NonNullable<
  Awaited<ReturnType<typeof fetchTermDataBySubAccount>>["user_asset_acts"]
>[number]["user_asset_act"];

/**
 * 明細 API を呼ぶ期間を月初〜月末の組で並べる．scheduled は今月と先月の 2 か月，
 * それ以外は BACKFILL_START_DATE の月まで 12 か月ずつ遡る．
 * 月は「年 × 12 + 月 − 1」の通し番号で受け取る．Date のローカル TZ のメソッドで月を数えると，
 * TZ が JST でないホストで JST の月初 0 時が前月に入り，期間が 1 か月ずれるため
 */
function buildTransactionFetchWindows(
  isIncrementalSync: boolean,
  currentMonthIndex: number,
  minBackfillMonthIndex: number,
): Array<{ from: string; to: string }> {
  const formatMonthWindow = (startIndex: number, endIndex: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const startYear = Math.floor(startIndex / 12);
    const endYear = Math.floor(endIndex / 12);
    const endMonth = (endIndex % 12) + 1;
    // Date.UTC の日に 0 を渡すと前月の末日になる．UTC で計算するので TZ に依存しない
    const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
    return {
      from: `${startYear}-${pad((startIndex % 12) + 1)}-01`,
      to: `${endYear}-${pad(endMonth)}-${pad(lastDay)}`,
    };
  };

  const windows: Array<{ from: string; to: string }> = [];
  if (isIncrementalSync) {
    windows.push(formatMonthWindow(currentMonthIndex, currentMonthIndex));
    windows.push(
      formatMonthWindow(currentMonthIndex - 1, currentMonthIndex - 1),
    );
  } else {
    // API の取得上限を 1 年に制限し、バックフィル時は 1 年単位で区切って遡及する
    const chunkMonths = 12;
    let chunkEnd = currentMonthIndex;
    while (chunkEnd >= minBackfillMonthIndex) {
      const chunkStart = Math.max(
        chunkEnd - (chunkMonths - 1),
        minBackfillMonthIndex,
      );
      windows.push(formatMonthWindow(chunkStart, chunkEnd));
      chunkEnd = chunkStart - 1;
    }
  }
  return windows;
}

/**
 * 明細 API の act 1 件を保存用の明細に変換する．日付か金額が読めない act は null を返す．
 * sa は act を取得したときに問い合わせた子口座で，act から子口座名が決まらないときの既定値になる．
 */
function convertMfActToScrapedTransaction(
  act: MfUserAssetAct,
  sa: { hash: string; name: string },
  account: Pick<MfAccountSummary, "name">,
  {
    localSubNameByHash,
    globalSubAccountNameByHash,
    accountNameByIdHash,
  }: {
    localSubNameByHash: Map<string, string>;
    globalSubAccountNameByHash: Map<string, string>;
    accountNameByIdHash: Map<string, string>;
  },
): ScrapedTransaction | null {
  const recognizedDate = act.recognized_at
    ? toJstDateString(act.recognized_at)
    : undefined;
  const amount = Math.trunc(Number(act.amount));
  if (!recognizedDate || !Number.isFinite(amount)) return null;

  const subAccountIdHash = act.sub_account_id_hash ?? sa.hash;
  const partnerSubAccountIdHash =
    act.partner_act?.sub_account_id_hash ??
    act.partner_act?.partner_sub_account_id_hash ??
    undefined;
  const partnerAccountIdHash =
    act.partner_account?.partner_account?.account_id_hash;

  const partnerSubFromPayload = buildSubAccountMergeName(
    act.partner_sub_account?.partner_sub_account?.sub_type ?? "",
    act.partner_sub_account?.partner_sub_account?.sub_name ?? "",
  );
  const currentSubFromPayload = buildSubAccountMergeName(
    act.sub_account?.sub_account?.sub_type ?? "",
    act.sub_account?.sub_account?.sub_name ?? "",
  );

  // 振替取引: subAccountIdHash はクエリ元（振替元）サブアカウントを指すためハッシュベースの名前を優先
  // 非振替取引: act.sub_account は実際の取引サブアカウントを指す
  //   - act.sub_account.sub_account が存在し、sub_name が非空 → ペイロード名を優先
  //   - それ以外（空 / "メイン" プレースホルダー）→ ハッシュベースの名前にフォールバック
  const currentSubName = act.is_transfer
    ? (localSubNameByHash.get(subAccountIdHash) ??
      globalSubAccountNameByHash.get(subAccountIdHash) ??
      sa.name)
    : act.sub_account?.sub_account?.sub_name &&
        currentSubFromPayload !== "メイン"
      ? currentSubFromPayload
      : (localSubNameByHash.get(subAccountIdHash) ??
        globalSubAccountNameByHash.get(subAccountIdHash) ??
        sa.name);
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
  // "残高" などは内部ラベルであり実際の口座ではないため振替として処理しない
  const isInternalLabel = (name: string) =>
    ["残高", "残高変更", "利息", "ポイント", "ボーナスポイント"].includes(name);
  // transfer_type: "outside" は他サービスへの振替で partner 口座が存在しない
  // 振替として処理できない場合は isTransfer: false として通常の取引として保存
  const shouldTreatAsTransfer =
    act.is_transfer &&
    partnerSubName &&
    !isInternalLabel(partnerSubName) &&
    act.transfer_type !== "outside";

  if (shouldTreatAsTransfer) {
    if (amount < 0) {
      transferFromSubAccount =
        currentSubName || currentSubFromPayload || sa.name;
      transferToSubAccount = partnerSubName;
    } else {
      transferFromSubAccount = partnerSubName;
      transferToSubAccount = currentSubName || currentSubFromPayload || sa.name;
    }
  } else if (act.is_transfer && !shouldTreatAsTransfer) {
    // 振替として処理できない場合はログ出力（isTransfer: false として保存される）
    logger.info(
      {
        id: act.id,
        content: act.content,
        amount: act.amount,
        isTransfer: act.is_transfer,
        transferType: act.transfer_type,
        partnerSubName,
        reason:
          act.transfer_type === "outside"
            ? "outside transfer (no partner account)"
            : isInternalLabel(partnerSubName ?? "")
              ? "internal label partner"
              : "missing partner",
      },
      "Transfer not treated as transfer — saving as regular transaction.",
    );
  }

  return {
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
    isTransfer: Boolean(shouldTreatAsTransfer),
    transferFromSubAccount,
    transferToSubAccount,
    subAccountIdHash,
    partnerSubAccountIdHash,
    partnerInstitutionName: partnerInstitutionName ?? undefined,
    partnerSubAccountName: partnerSubName ?? undefined,
    rawApiData: {
      id: act.id,
      content: act.content,
      amount: act.amount,
      recognized_at: act.recognized_at,
      is_transfer: act.is_transfer,
      transfer_type: act.transfer_type,
      sub_account_id_hash: act.sub_account_id_hash,
      partner_act: act.partner_act,
      partner_account: act.partner_account,
      partner_sub_account: act.partner_sub_account,
      sub_account: act.sub_account,
    },
  };
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
  failures: SyncFailureCounts,
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

  const allTransactions: ScrapedTransaction[] = [];
  const seenActIds = new Set<number>();

  // 月の通し番号（年 × 12 + 月 − 1）．JST の暦で数え，サーバーのローカル TZ に依存しない
  const [currentYear, currentMonth] = formatJSTDate(new Date())
    .split("-")
    .map(Number);
  const currentMonthIndex = currentYear * 12 + currentMonth - 1;
  const [backfillYear, backfillMonth] =
    BACKFILL_START_DATE.split("-").map(Number);
  const minBackfillMonthIndex = backfillYear * 12 + backfillMonth - 1;

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
          : `backfill to ${BACKFILL_START_DATE}`,
      },
      "Processing transactions.",
    );

    const windows = buildTransactionFetchWindows(
      isIncrementalSync,
      currentMonthIndex,
      minBackfillMonthIndex,
    );

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

            const transaction = convertMfActToScrapedTransaction(
              act,
              sa,
              account,
              {
                localSubNameByHash,
                globalSubAccountNameByHash,
                accountNameByIdHash,
              },
            );
            if (transaction) allTransactions.push(transaction);
          }
        } catch (error) {
          logger.warn(
            { err: error, account: account.name, subHash: sa.hash, from, to },
            "⚠️ Failed to fetch transactions.",
            error,
          );
          countSyncFailure(failures, "transactionFetch");
        }
      }
    }
  }

  logger.info({ count: allTransactions.length }, "✅ Found transactions.");
  return allTransactions;
}

// 残高履歴の日付計算に使う．toJstMidnight は YYYY-MM-DD を JST の 0 時の Date にする
const toJstMidnight = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00+09:00`);
const formatYmd = (d: Date) => formatJSTDate(d);

// service_detail API の disp_sum_history にある資産種別ごとの系列を，日ごとに足して 1 本にする．
// 呼び出し側は末尾を to_date として日付を割り当てるので，長さの違う系列は末尾（to_date 側）でそろえて足す．
// to_date がないか，系列が空なら null を返す
const parseMergedHistory = (
  detail?: MfServiceDetailResponse["account_detail"],
) => {
  const toDateStr = detail?.to_date;
  const fromDateStr = detail?.from_date;
  const histories = detail?.disp_sum_history ?? {};
  const historyEntries = Object.entries(histories).filter(
    (entry): entry is [string, number[]] =>
      Array.isArray(entry[1]) && entry[1].length > 0,
  );
  const seriesByType = historyEntries.map(([, series]) => series);
  if (!toDateStr || seriesByType.length === 0) return null;

  const seriesLen = Math.max(...seriesByType.map(arr => arr.length));
  if (seriesLen <= 0) return null;

  const mergedSeries = Array.from({ length: seriesLen }, (_, index) =>
    Math.trunc(
      seriesByType.reduce(
        (sum, arr) => sum + (arr[index - (seriesLen - arr.length)] ?? 0),
        0,
      ),
    ),
  );
  return { toDateStr, fromDateStr, mergedSeries };
};

/**
 * 証券口座なら，口座詳細ページから投資信託の保有銘柄を取って Holding に保存し，保有履歴を計算し直す．
 * 証券の子口座がない，ページを読めないなどの場合は何もしない．失敗は警告に留め，例外は投げない
 * （呼び出し側はこのあと同じ金融機関の残高履歴の取得を続ける）．
 */
async function saveInvestmentHoldings(
  page: Page,
  mainAccount: { label: string; subAccounts: SubAccount[] },
  summary: MfAccountSummary,
  today: Date,
  failures: SyncFailureCounts,
): Promise<void> {
  const mainSubAccountsForHolding = mainAccount.subAccounts;
  const investmentSubAccount = mainSubAccountsForHolding.find(
    sa => sa.assetType === "INVESTMENT",
  );
  logger.debug(
    { label: mainAccount.label, hasInvestment: !!investmentSubAccount },
    "🔍 Holdings fetch check.",
  );
  if (investmentSubAccount && summary.sub_accounts) {
    const securitiesSubSummary = summary.sub_accounts.find(sa =>
      sa.sub_type.startsWith("証券"),
    );
    if (securitiesSubSummary) {
      try {
        const showAccountId = extractShowAccountId(summary.show_path);
        // continue だと，この金融機関の残高履歴（下のループ）まで飛ばしてしまう
        if (!showAccountId) {
          throw new Error("show_path has no account id");
        }
        const pageData = await fetchAccountHoldingsPage(page, showAccountId);
        logger.debug(
          {
            label: mainAccount.label,
            hasPageData: !!pageData,
            hasAssetClasses:
              !!pageData?.account?.grouped_asset_details_by_asset_classes,
          },
          "📋 Account page data.",
        );
        if (pageData?.account?.grouped_asset_details_by_asset_classes) {
          const allAssetDetails: MfAssetDetail[] = [];
          for (const assetClass of pageData.account
            .grouped_asset_details_by_asset_classes) {
            for (const subclass of assetClass.asset_subclasses ?? []) {
              allAssetDetails.push(...(subclass.asset_details ?? []));
            }
          }
          // asset_class_id=3 (MF) かつ asset_subclass_id=12 (MUTUAL_FUND/投資信託)
          const mfDetails = allAssetDetails.filter(
            d => d.asset_class_id === 3 && d.asset_subclass_id === 12,
          );
          logger.debug(
            { label: mainAccount.label, mfCount: mfDetails.length },
            "📊 Found asset_details from account page.",
          );
          // ページを読めていれば，投資信託が 0 件でも呼ぶ（全部売却したときに Holding を消すため）
          const todayStr = formatJSTDate(today);
          await saveHoldingsFromAccountPage(
            investmentSubAccount.id,
            investmentSubAccount.currentName,
            mfDetails,
            todayStr,
            failures,
          );
          await recalculateHoldingHistory(investmentSubAccount.id);
        }
      } catch (error) {
        logger.warn(
          { err: error, label: mainAccount.label },
          "⚠️ Failed to fetch account holdings page.",
        );
        countSyncFailure(failures, "holdingsPage");
      }
    }
  }
}

/**
 * 1 つの子口座について，対応する MF の子口座ごとに range=all で残高履歴を取り，日ごとに合算して
 * minDate〜today の範囲を BalanceHistory に保存する．保存した件数を返す．
 * 取得や保存に失敗したら警告を出し，例外は投げずに，それまでに保存した件数を返す．
 */
async function saveSubAccountBalanceHistory(
  page: Page,
  mainAccount: { label: string },
  summary: MfAccountSummary,
  subAccount: SubAccount,
  uniqueCandidateSubSummaries: MfSubAccountSummary[],
  minDate: Date,
  today: Date,
  failures: SyncFailureCounts,
): Promise<number> {
  let saved = 0;
  try {
    const mergedHistoryByDate = new Map<string, number>();

    for (const subSummary of uniqueCandidateSubSummaries) {
      // range: "all" で全履歴を1回のAPI呼び出しで取得
      logger.debug(
        {
          label: mainAccount.label,
          subAccount: subAccount.currentName,
          subHash: subSummary.sub_account_id_hash,
        },
        "🔗 Calling service_detail API.",
      );
      const payload = await fetchServiceDetailBySubAccount(
        page,
        summary.account_id_hash,
        subSummary.sub_account_id_hash,
        "all",
      );
      const parsed = parseMergedHistory(payload.account_detail);
      if (!parsed) continue;

      const toDate = toJstMidnight(parsed.toDateStr);
      // 日は UTC のメソッドで戻す．ローカル TZ のメソッドは，夏時間のある TZ で時刻がずれる
      const inferredFromDate = new Date(toDate);
      inferredFromDate.setUTCDate(
        toDate.getUTCDate() - (parsed.mergedSeries.length - 1),
      );

      logger.debug(
        {
          label: mainAccount.label,
          subAccount: subAccount.currentName,
          subHash: subSummary.sub_account_id_hash,
          range: "all",
          points: parsed.mergedSeries.length,
          from: formatYmd(inferredFromDate),
          to: parsed.toDateStr,
        },
        "History fetched with range=all.",
      );

      // minDate 〜 today の範囲にクリップしてマージ
      for (let i = 0; i < parsed.mergedSeries.length; i++) {
        const day = new Date(
          inferredFromDate.getTime() + i * 24 * 60 * 60 * 1000,
        );
        if (day < minDate || day > today) continue;

        const dateKey = formatYmd(day);
        const balance = parsed.mergedSeries[i];
        if (!Number.isFinite(balance)) continue;
        mergedHistoryByDate.set(
          dateKey,
          Math.trunc((mergedHistoryByDate.get(dateKey) ?? 0) + balance),
        );
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
      saved++;
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
    countSyncFailure(failures, "balanceHistory");
  }
  return saved;
}

/**
 * 残高履歴ページから過去の残高を取得する（同期中のプロバイダーの全金融機関対象）
 * URL: https://moneyforward.com/bs/history/list/{YYYY-MM-DD}
 * 履歴ページには全金融機関のデータが含まれるため、一度のループで全口座を処理する。
 */
async function scrapeBalanceHistory(
  page: Page,
  providerId: string,
  options: MfScraperOptions,
  failures: SyncFailureCounts,
) {
  logger.info("📊 Scraping balance history via service_detail API...");

  // 同期中のプロバイダーに絞る．他の MF アカウントの口座を含めると，金融機関名の照合で
  // このセッションの履歴が別アカウントの子口座に書き込まれ，そのアカウントのロックも取っていない
  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
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

  // todayJST() と toJstMidnight() は TZ に依存せず JST 0 時を返す．ここで setHours(0) をかけると，
  // TZ が JST でないホストではローカル TZ の 0 時に動き，日付が 1 日前にずれる
  const today = todayJST();

  let minDate: Date;
  if (options.mode === "manual") {
    minDate = toJstMidnight(BACKFILL_START_DATE);
  } else {
    // 2 ヶ月前を求める．setMonth は月末で rollover するため（例: 4/30 → 3/2），
    // 対象月の末日に日付をクランプして JST 暦日ベースで計算する．
    // 月インデックスを負数にすると Date.UTC が年またぎを処理してくれる．
    const [y, m, d] = formatJSTDate(today).split("-").map(Number);
    const targetMonthIndex = m - 1 - 2;
    const lastDay = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate();
    const dt = new Date(Date.UTC(y, targetMonthIndex, Math.min(d, lastDay)));
    minDate = toJstMidnight(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(
        2,
        "0",
      )}-${String(dt.getUTCDate()).padStart(2, "0")}`,
    );
  }

  let totalSaved = 0;
  let totalSubAccounts = 0;

  for (const mainAccount of mainAccounts) {
    let summary: MfAccountSummary | undefined;

    if (mainAccount.mfUrlId) {
      summary = summaryByShowId.get(mainAccount.mfUrlId);
    }
    // hashマッチ失敗時は名前でフォールバック
    if (!summary) {
      summary = accountSummaries.find(
        acc =>
          normalizeInstitutionName(acc.name) ===
          normalizeInstitutionName(mainAccount.label),
      );
    }

    logger.debug(
      {
        label: mainAccount.label,
        mfUrlId: mainAccount.mfUrlId,
        summaryFound: !!summary?.account_id_hash,
      },
      "📋 Processing mainAccount.",
    );

    if (!summary?.account_id_hash) {
      continue;
    }

    await saveInvestmentHoldings(page, mainAccount, summary, today, failures);

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
      // 負債口座の履歴スクレイピングはスキップ
      // （MF API が負債口座の履歴データを正確に返さないため）
      // 負債口座の BalanceHistory は recalculateLiabilityHistory で逆算
      if (subAccount.assetType === "LIABILITY") continue;
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
      // 種別（sub_type）でマッチする（証券口座など name マッチが失敗する場合）
      if (!candidateSubSummaries || candidateSubSummaries.length === 0) {
        // 証券サブ口座は INVESTMENT を優先し，なければ CASH の 1 口座にだけ割り当てる．
        // 処理中の子口座がその口座でなければ割り当てない（POINT や別の CASH 口座に書き込まないため）
        const securitiesTarget =
          mainAccount.subAccounts.find(msa => msa.assetType === "INVESTMENT") ??
          mainAccount.subAccounts.find(msa => msa.assetType === "CASH");
        if (securitiesTarget?.id === subAccount.id) {
          const securitiesSubSummary = (summary.sub_accounts ?? []).find(
            sa => sa.sub_type === "証券" && Boolean(sa.sub_account_id_hash),
          );
          if (securitiesSubSummary) {
            candidateSubSummaries = [securitiesSubSummary];
          }
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
      if (uniqueCandidateSubSummaries.length === 0) {
        logger.debug(
          {
            label: mainAccount.label,
            subAccount: subAccount.currentName,
            assetType: subAccount.assetType,
          },
          "⏭️ No candidate subSummary.",
        );
        continue;
      }
      totalSubAccounts++;

      totalSaved += await saveSubAccountBalanceHistory(
        page,
        mainAccount,
        summary,
        subAccount,
        uniqueCandidateSubSummaries,
        minDate,
        today,
        failures,
      );
    }
  }

  logger.info(
    { saved: totalSaved, subAccounts: totalSubAccounts },
    "✅ Balance history scraping complete.",
  );
}

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

  // 当日分の残高履歴は，今回 MF が返した子口座にだけ記録する．
  // DB の全子口座に書くと，解約した口座や今回返らなかった口座も前回の残高で毎日記録される
  const savedSubAccountIds: string[] = [];

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

    const savedSubAccount = await prisma.subAccount.upsert({
      where: {
        mainAccountId_currentName: {
          mainAccountId: mainAccount.id,
          currentName: account.subAccountName,
        },
      },
      create: {
        mainAccountId: mainAccount.id,
        currentName: account.subAccountName,
        balance: Math.trunc(account.balance),
      },
      update: {
        balance: Math.trunc(account.balance),
      },
    });
    savedSubAccountIds.push(savedSubAccount.id);
  }

  // 残高履歴は scrapeBalanceHistory で処理するため、ここでは本日分のみ保存．
  // 日時は scrapeBalanceHistory と同じ JST 08:00 にする．setHours はサーバーのローカル TZ で
  // 動くので，TZ が JST でないと別の行ができ，日付もずれる
  const today = new Date(`${formatJSTDate(todayJST())}T08:00:00+09:00`);
  const allSubAccounts = await prisma.subAccount.findMany({
    where: { id: { in: savedSubAccountIds } },
    select: { id: true, balance: true },
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
 * メイン口座内でまだ振替になっていない明細のうち，同日・逆符号・同額で，
 * 両方の説明に「振替」を含む 2 件を振替のペアとして結び付ける．
 */
async function buildTransferPairs(mainAccountId: string) {
  // 同日同額（±amount）だけでは無関係な収入＋支出ペアを振替と誤認するため，
  // 両明細の説明に「振替」を含むこと（スクレイパーは振替を
  // `振替: X → Y` で保存し，MF の生データも「…への振替」を含む）を要求する．
  // ペアリングできない明細は通常取引として表示され続ける（安全側）．
  // 条件を満たさない明細は相手にもならないので，取得の段階で絞る
  const unresolved = await prisma.transaction.findMany({
    where: {
      subAccount: { mainAccount: { id: mainAccountId } },
      isTransfer: false,
      desc: { contains: "振替" },
    },
    orderBy: [{ date: "asc" }, { amount: "asc" }, { id: "asc" }],
  });

  // 同期のたびに全件を総当たりすると O(n²) になるので，日付と金額で相手の候補を引く．
  // 候補は取得順に並ぶので，前から見て最初に条件を満たすものと組む（総当たりと同じ結果になる）
  const pairKey = (date: Date, amount: number) => `${date.getTime()}:${amount}`;
  const indexesByKey = new Map<string, number[]>();
  unresolved.forEach((tx, index) => {
    const key = pairKey(tx.date, tx.amount);
    const indexes = indexesByKey.get(key);
    if (indexes) indexes.push(index);
    else indexesByKey.set(key, [index]);
  });

  const used = new Set<string>();
  for (let i = 0; i < unresolved.length; i++) {
    const a = unresolved[i];
    if (used.has(a.id) || a.amount === 0) continue;

    const candidates = indexesByKey.get(pairKey(a.date, -a.amount)) ?? [];
    const j = candidates.find(
      index =>
        index > i &&
        !used.has(unresolved[index].id) &&
        unresolved[index].subAccountId !== a.subAccountId,
    );
    if (j === undefined) continue;
    const b = unresolved[j];

    // 片方だけ更新されると linkedTransId が相手を指さない半端なペアが残るため，
    // 2 件の更新を 1 つのトランザクションにまとめる
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: a.id },
        data: {
          isTransfer: true,
          linkedTransId: b.id,
        },
      }),
      prisma.transaction.update({
        where: { id: b.id },
        data: {
          isTransfer: true,
          linkedTransId: a.id,
        },
      }),
    ]);
    used.add(a.id);
    used.add(b.id);
  }
}

/**
 * カテゴリー分類ルールを優先度の高い順に，カテゴリー未設定の明細へ適用する（大文字小文字を区別しない）．
 */
async function applyCategoryRules() {
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
}

/**
 * 解決できなかった振替の生データを debug/unresolved_transfers.json に追記する．
 * 生の摘要・金額と子口座一覧を含み，削除もローテーションもされないため開発時だけに限る．
 * 本番コンテナ (Dockerfile で NODE_ENV=production) では書き込み可能レイヤーに溜まり続ける．
 */
function writeUnresolvedTransferDebugJson(
  tx: ScrapedTransaction,
  subAccounts: Array<{
    id: string;
    currentName: string;
    assetType: string;
    mainAccount: { label: string };
  }>,
) {
  if (process.env.NODE_ENV === "production") return;
  const debugDir = join(process.cwd(), "debug");
  const debugFile = join(debugDir, "unresolved_transfers.json");
  try {
    mkdirSync(debugDir, { recursive: true });
    let records: Array<{
      date: string;
      amount: number;
      desc: string;
      subAccountName: string;
      isTransfer: boolean;
      transferFromSubAccount?: string;
      transferToSubAccount?: string;
      subAccountIdHash?: string;
      partnerSubAccountIdHash?: string;
      partnerInstitutionName?: string;
      partnerSubAccountName?: string;
      rawApiData?: Record<string, unknown>;
      availableSubAccounts: Array<{
        id: string;
        currentName: string;
        mainAccountLabel: string;
        assetType: string;
      }>;
    }> = [];
    try {
      const existing = readFileSync(debugFile, "utf-8");
      records = JSON.parse(existing);
    } catch {
      // file does not exist or invalid JSON
    }
    records.push({
      date: tx.date,
      amount: tx.amount,
      desc: tx.desc,
      subAccountName: tx.subAccountName,
      isTransfer: tx.isTransfer,
      transferFromSubAccount: tx.transferFromSubAccount,
      transferToSubAccount: tx.transferToSubAccount,
      subAccountIdHash: tx.subAccountIdHash,
      partnerSubAccountIdHash: tx.partnerSubAccountIdHash,
      partnerInstitutionName: tx.partnerInstitutionName,
      partnerSubAccountName: tx.partnerSubAccountName,
      rawApiData: (tx as { rawApiData?: Record<string, unknown> }).rawApiData,
      availableSubAccounts: subAccounts.map(sa => ({
        id: sa.id,
        currentName: sa.currentName,
        mainAccountLabel: sa.mainAccount.label,
        assetType: sa.assetType,
      })),
    });
    writeFileSync(debugFile, JSON.stringify(records, null, 2), "utf-8");
    logger.info(
      {
        file: debugFile,
        totalRecords: records.length,
      },
      "Debug: saved unresolved transfer data.",
    );
  } catch (error) {
    logger.warn(
      { err: error },
      "⚠️ Failed to write debug JSON for unresolved transfer.",
    );
  }
}

/**
 * 子口座名で照合できなかった通常の明細について，メイン口座の子口座から紐付け先を推定する．
 * 一意に決まらない場合は undefined を返し，呼び出し元はその明細を保存しない．
 */
function findFallbackSubAccount(
  tx: ScrapedTransaction,
  mainAccount: { subAccounts: SubAccount[] },
): SubAccount | undefined {
  let subAccount: SubAccount | undefined;
  logger.debug(
    {
      subAccounts: mainAccount.subAccounts
        .map(s => `"${s.currentName}"`)
        .join(", "),
    },
    "   Available DB subAccounts.",
  );
  // フォールバック1: MF側で "Main" になった場合、子口座が1つならそこへ紐付ける
  if (
    isPlaceholderSubAccountName(tx.subAccountName) &&
    mainAccount.subAccounts.length === 1
  ) {
    subAccount = mainAccount.subAccounts[0];
    logger.debug(
      { subAccount: subAccount.currentName },
      "   Fallback matched to the only sub account.",
    );
  }

  // フォールバック2: Main で子口座が複数の場合は、明細説明文から既存子口座を推定
  if (!subAccount && isPlaceholderSubAccountName(tx.subAccountName)) {
    const sortedCandidates = [...mainAccount.subAccounts].sort(
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
      const normalizedText = normalizeLoose(`${tx.desc} ${rawInfo}`);
      const normalizedMatched = sortedCandidates.filter(sa =>
        normalizedText.includes(normalizeLoose(sa.currentName)),
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
    const sortedCandidates = [...mainAccount.subAccounts].sort(
      (a, b) => b.currentName.length - a.currentName.length,
    );
    const rawInfo = (tx as { rawInfo?: string }).rawInfo ?? "";
    const normalizedText = normalizeLoose(
      `${tx.subAccountName} ${tx.desc} ${rawInfo}`,
    );
    const normalizedMatched = sortedCandidates.filter(sa =>
      normalizedText.includes(normalizeLoose(sa.currentName)),
    );
    if (normalizedMatched.length === 1) {
      subAccount = normalizedMatched[0];
      logger.debug(
        { subAccount: subAccount.currentName },
        "   Fallback matched by normalized text.",
      );
    }
  }
  return subAccount;
}

type SubAccountWithLabel = SubAccount & { mainAccount: { label: string } };

/**
 * 振替元・振替先の子口座を，スクレイピング時の名前と rawInfo から探す．
 * 名前の完全一致を優先し，なければ rawInfo に含まれる子口座名で長い順に部分一致させる．
 * 同名の子口座が複数あるときは，金融機関名が rawInfo に含まれる方を選ぶ．
 */
function findTransferSubAccountByName(
  subAccounts: SubAccountWithLabel[],
  name: string,
  rawInfo: string,
): SubAccountWithLabel | undefined {
  if (!name) return undefined;

  const normalizedRawInfo = normalizeLoose(rawInfo);

  // 1. 完全一致する子口座候補を抽出
  const exactMatches = subAccounts.filter(sa => sa.currentName === name);
  if (exactMatches.length > 0) {
    // 候補の中で、金融機関名(label)がrawInfoに含まれているものを優先的に探す
    const refined = exactMatches.find(sa =>
      normalizedRawInfo.includes(normalizeLoose(sa.mainAccount.label)),
    );
    return refined || exactMatches[0];
  }

  // 2. 部分一致 (文字数の長い順)
  const sortedAll = [...subAccounts].sort(
    (a, b) => b.currentName.length - a.currentName.length,
  );
  const normalizedName = normalizeLoose(name);

  for (const sa of sortedAll) {
    const normalizedSaName = normalizeLoose(sa.currentName);
    if (normalizedRawInfo.includes(normalizedSaName)) {
      if (
        normalizedName.includes(normalizedSaName) ||
        name.includes(sa.currentName)
      ) {
        // 同名の子口座が複数ある場合に備え、該当する名前を持つ口座群から再絞り込み
        const sameNameMatches = sortedAll.filter(
          x => normalizeLoose(x.currentName) === normalizedSaName,
        );
        const refined = sameNameMatches.find(x =>
          normalizedRawInfo.includes(normalizeLoose(x.mainAccount.label)),
        );
        return refined || sa;
      }
    }
  }

  return undefined;
}

function findSubAccountByInstitutionAndName(
  subAccounts: SubAccountWithLabel[],
  institutionName: string,
  subAccountName: string,
): SubAccountWithLabel | undefined {
  if (!institutionName || !subAccountName) return undefined;
  return subAccounts.find(
    sa =>
      normalizeInstitutionName(sa.mainAccount.label) ===
        normalizeInstitutionName(institutionName) &&
      sa.currentName === subAccountName,
  );
}

/**
 * API 由来の sub_account_id_hash と DB の SubAccount を事前に対応付ける．
 * 明細自身の子口座と振替相手の子口座の両方を登録し，同じハッシュは最初に見つかった対応を使う．
 */
function buildSubAccountByHashHint(
  transactions: ScrapedTransaction[],
  subAccounts: SubAccountWithLabel[],
): Map<string, SubAccountWithLabel> {
  const subAccountByHashHint = new Map<string, SubAccountWithLabel>();
  for (const tx of transactions) {
    const hash = (tx as { subAccountIdHash?: string }).subAccountIdHash;
    if (hash && !subAccountByHashHint.has(hash)) {
      const matched = subAccounts.find(
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
        subAccounts,
        partnerInstitutionName,
        partnerSubAccountName,
      );
      if (matchedPartner) {
        subAccountByHashHint.set(partnerHash, matchedPartner);
      }
    }
  }
  return subAccountByHashHint;
}

function resolveSubAccountByHash(
  subAccountByHashHint: Map<string, SubAccountWithLabel>,
  hash?: string,
) {
  return hash ? subAccountByHashHint.get(hash) : undefined;
}

/**
 * 振替明細の振替元・振替先の子口座を解決する．
 * API のハッシュ，金融機関名と子口座名，rawInfo の「A から B への振替」，スクレイピング時の名前の順に試す．
 * 見えている側の子口座 (hintedCurrent / hashedCurrent) も返し，呼び出し元が通常明細として保存済みの行を消すのに使う．
 */
function resolveTransferSubAccounts(
  tx: ScrapedTransaction,
  subAccounts: SubAccountWithLabel[],
  subAccountByHashHint: Map<string, SubAccountWithLabel>,
) {
  const rawInfo = (tx as { rawInfo?: string }).rawInfo ?? "";
  const transferMatch = rawInfo.match(/(.+?)から(.+?)への振替/);

  let fromSubAccount: SubAccountWithLabel | undefined;
  let toSubAccount: SubAccountWithLabel | undefined;

  // まずは API のハッシュ情報で解決する
  const hashedCurrent = resolveSubAccountByHash(
    subAccountByHashHint,
    (tx as { subAccountIdHash?: string }).subAccountIdHash,
  );
  const hashedPartner = resolveSubAccountByHash(
    subAccountByHashHint,
    (tx as { partnerSubAccountIdHash?: string }).partnerSubAccountIdHash,
  );
  const hintedCurrent = findSubAccountByInstitutionAndName(
    subAccounts,
    tx.institutionName,
    tx.subAccountName,
  );
  const hintedPartner = findSubAccountByInstitutionAndName(
    subAccounts,
    (tx as { partnerInstitutionName?: string }).partnerInstitutionName ?? "",
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

    // 同期中のプロバイダーの全金融機関の子口座から振替元・振替先を検索
    fromSubAccount = findTransferSubAccountByName(
      subAccounts,
      tx.transferFromSubAccount ?? "",
      fromPart,
    );
    toSubAccount = findTransferSubAccountByName(
      subAccounts,
      tx.transferToSubAccount ?? "",
      toPart,
    );

    // スクレイピング時に特定された名前でも再検索
    if (!fromSubAccount && tx.transferFromSubAccount) {
      fromSubAccount = subAccounts.find(
        sa => sa.currentName === tx.transferFromSubAccount,
      );
    }
    if (!toSubAccount && tx.transferToSubAccount) {
      toSubAccount = subAccounts.find(
        sa => sa.currentName === tx.transferToSubAccount,
      );
    }
  } else if (!fromSubAccount || !toSubAccount) {
    // rawInfo がない場合は、スクレイピング時の情報を使用
    if (tx.transferFromSubAccount) {
      fromSubAccount = subAccounts.find(
        sa => sa.currentName === tx.transferFromSubAccount,
      );
    }
    if (tx.transferToSubAccount) {
      toSubAccount = subAccounts.find(
        sa => sa.currentName === tx.transferToSubAccount,
      );
    }
  }

  return { fromSubAccount, toSubAccount, hashedCurrent, hintedCurrent };
}

/**
 * 解決できた振替を，振替元の出金と振替先の入金の 2 件として 1 つのトランザクションで保存する．
 * 同じ明細を通常の明細として保存した行が見えている側の子口座に残っていれば，同じトランザクションで消す．
 * 保存できたら true を返す．失敗はログに残して false を返し，同期は続ける．
 */
async function saveTransferPair(
  tx: ScrapedTransaction,
  fromSubAccount: SubAccountWithLabel,
  toSubAccount: SubAccountWithLabel,
  currentVisibleSideAccount: { id: string } | undefined,
): Promise<boolean> {
  const absAmount = Math.abs(tx.amount);
  const fromName = fromSubAccount.currentName;
  const toName = toSubAccount.currentName;
  const transferDesc = `振替: ${fromName} → ${toName}`;

  // 振替の両方の記録をアトミックに処理
  try {
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
    return true;
  } catch (error) {
    logger.error(
      { err: error, date: tx.date, from: fromName, to: toName },
      "❌ Failed to save transfer.",
    );
    return false;
  }
}

// 明細の金融機関名と DB のメイン口座名を normalizeInstitutionName で揃えて照合する
function findMainAccountByNormalizedName<T extends { label: string }>(
  mainAccounts: T[],
  instName: string,
): T | null {
  return (
    mainAccounts.find(
      ma =>
        normalizeInstitutionName(ma.label) ===
        normalizeInstitutionName(instName),
    ) || null
  );
}

/**
 * 初回や口座追加時に備えて，明細に出てくる子口座名を，その明細の金融機関のメイン口座の子口座として先に作っておく．
 */
async function upsertSubAccountsFromTransactions(
  transactions: ScrapedTransaction[],
  mainAccounts: Array<{ id: string; label: string }>,
): Promise<void> {
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
    const mainAccount = findMainAccountByNormalizedName(
      mainAccounts,
      institutionName,
    );
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
}

/**
 * 明細 1 件を upsert する．保存できたら true，失敗したらログを出して false を返す．
 */
async function saveSingleTransaction(
  subAccountId: string,
  date: string,
  amount: number,
  desc: string,
  isTransfer = false,
): Promise<boolean> {
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
      // ID は subAccountId，date，amount，desc のハッシュなので，既存の行で変わりうるのは isTransfer だけである．
      // それを上書きすると，アプリで振替にした明細（markTransactionAsTransfer や振替ルール）が
      // 同期のたびに振替でない状態へ戻り，相手側の明細だけが振替として残るため，既存の行は書き換えない．
      // 日付や金額が変わった取引は別 ID の新しい行になり，古い行は残る（DATA-1）
      update: {},
    });
    return true;
  } catch (error) {
    logger.error({ err: error, txId }, "❌ Failed to save transaction.");
    return false;
  }
}

/**
 * 振替でない明細の保存先の子口座を探す．API のハッシュ，メイン口座の子口座名の完全一致，
 * normalizeLoose での一致，findFallbackSubAccount の推定の順に試す．見つからなければ null か undefined を返す．
 */
function resolveRegularTransactionSubAccount(
  tx: ScrapedTransaction,
  mainAccounts: Array<{ label: string; subAccounts: SubAccount[] }>,
  subAccountByHashHint: Map<string, SubAccountWithLabel>,
): SubAccount | null | undefined {
  const matchedMainAccount = findMainAccountByNormalizedName(
    mainAccounts,
    tx.institutionName,
  );
  let subAccount =
    resolveSubAccountByHash(
      subAccountByHashHint,
      (tx as { subAccountIdHash?: string }).subAccountIdHash,
    ) ??
    (matchedMainAccount
      ? (matchedMainAccount.subAccounts.find(
          sa => sa.currentName === tx.subAccountName,
        ) ??
        matchedMainAccount.subAccounts.find(
          sa =>
            normalizeLoose(sa.currentName) ===
            normalizeLoose(tx.subAccountName),
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
    if (matchedMainAccount) {
      subAccount = findFallbackSubAccount(tx, matchedMainAccount);
    } else {
      logger.warn(
        { institution: tx.institutionName },
        "   MainAccount not found either.",
      );
    }
  }
  return subAccount;
}

/**
 * 取引明細をDBに保存する関数
 */
async function saveTransactionsToDatabase(
  transactions: ScrapedTransaction[],
  providerId: string,
  failures: SyncFailureCounts,
) {
  logger.info("💾 Saving transactions to database...");

  // 全 mainAccount を事前取得し、正規化名でマッチングする
  const allMainAccountsFromDb = await prisma.mainAccount.findMany({
    where: { providerId },
    include: { subAccounts: true },
  });

  await upsertSubAccountsFromTransactions(transactions, allMainAccountsFromDb);

  // 同期中のプロバイダーの全子口座を取得（振替の相手先解決用）．
  // 全プロバイダーから探すと，「普通預金」のような同名の口座が別アカウントにある場合に
  // ロックを取っていない他プロバイダーの子口座へ振替を書き込んでしまう．
  // 1 つの MF アカウントの振替は，そのアカウント内の口座同士でしか起きない．
  const allSubAccountsInDb = await prisma.subAccount.findMany({
    where: { mainAccount: { providerId } },
    include: {
      mainAccount: { select: { id: true, label: true, providerId: true } },
    },
  });

  // 取引明細の保存
  let savedCount = 0;
  const processedTransferIds = new Set<string>();

  const subAccountByHashHint = buildSubAccountByHashHint(
    transactions,
    allSubAccountsInDb,
  );

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

      const { fromSubAccount, toSubAccount, hashedCurrent, hintedCurrent } =
        resolveTransferSubAccounts(
          tx,
          allSubAccountsInDb,
          subAccountByHashHint,
        );

      // 振替先/元が解決できない場合は保存しない（不正確な単独明細を残さない）
      if (!fromSubAccount || !toSubAccount) {
        writeUnresolvedTransferDebugJson(tx, allSubAccountsInDb);

        logger.warn(
          {
            sub: tx.subAccountName,
            from: tx.transferFromSubAccount ?? "?",
            to: tx.transferToSubAccount ?? "?",
            msgId: tx.msgUrlId,
            isTransfer: tx.isTransfer,
            rawApiData: (tx as { rawApiData?: Record<string, unknown> })
              .rawApiData,
          },
          "⚠️ Transfer unresolved and skipped.",
        );
        continue;
      }

      if (
        await saveTransferPair(
          tx,
          fromSubAccount,
          toSubAccount,
          hintedCurrent ?? hashedCurrent,
        )
      ) {
        savedCount += 2;
      } else {
        countSyncFailure(failures, "transactionSave");
      }
      continue;
    }

    // 通常の取引（振替でない、または振替情報が不完全な場合）
    const subAccount = resolveRegularTransactionSubAccount(
      tx,
      allMainAccountsFromDb,
      subAccountByHashHint,
    );

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

    if (
      await saveSingleTransaction(
        subAccount.id,
        tx.date,
        tx.amount,
        tx.desc,
        false,
      )
    ) {
      savedCount++;
    } else {
      countSyncFailure(failures, "transactionSave");
    }
  }

  // 3.5 新規口座追加時にも既存明細の振替関係を再構築する
  const providerMainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: { id: true },
  });
  for (const ma of providerMainAccounts) {
    await buildTransferPairs(ma.id);
  }

  // 4. カテゴリ分類ルールの適用
  await applyCategoryRules();

  logger.info(
    { saved: savedCount, total: transactions.length },
    "✅ Saved transactions to database.",
  );
}

/**
 * 負債口座の BalanceHistory を最新残高と入出金明細から逆算して更新する。
 *
 * MF API が負債口座の履歴データを正確に返さないため、以下のロジックで日次残高を再計算する：
 * 1. 最新残高（subAccount.balance）を取得
 * 2. スクレイピングした取引（DB に保存済み）を取得
 * 3. 銀行口座からの振替（返済）も追加
 * 4. 取引を日付ごとに集約（同日の購入と返済をネット化して合計）
 * 5. 最新残高から遡り、日付ごとに逆算して各日の残高を計算
 * 6. 最古取引の日〜今日まで全日を前方に順算して埋める
 * 7. BalanceHistory を upsert
 *
 * 符号の規則:
 * - amount > 0 (返済) → 負債減少。逆算: 返済前 = 返済後 - 返済額（返済前で大きい負債）
 * - amount < 0 (購入) → 負債増加。逆算: 購入前 = 購入後 - 購入額（購入前で小さい負債）
 *
 * 同日の購入と返済が両方存在する場合、それらをネット化して1日の正味変化量として扱う。
 * これにより、同日の複数取引が逆算結果に重複して影響するのを防ぐ。
 */
async function recalculateLiabilityHistory(
  _transactions: ScrapedTransaction[],
  providerId: string,
) {
  logger.info("🔄 Recalculating liability balance history...");

  const subAccounts = await prisma.subAccount.findMany({
    where: {
      mainAccount: { providerId },
      assetType: "LIABILITY",
    },
    select: { id: true, currentName: true, balance: true },
  });

  if (subAccounts.length === 0) {
    logger.info("ℹ️ No liability subAccounts found for recalculation.");
    return;
  }

  const today = todayJST();
  const todayStr = formatJSTDate(today);

  // DBから全取引を取得（スクレイピング結果に依存しない）
  const liabilityTransferIds = subAccounts.map(sa => sa.id);
  const allTransactions = await prisma.transaction.findMany({
    where: {
      subAccountId: { in: liabilityTransferIds },
      isTransfer: false,
    },
    select: {
      id: true,
      subAccountId: true,
      date: true,
      amount: true,
    },
  });

  // DBから全振替を取得（返済）
  const allTransfers = await prisma.transaction.findMany({
    where: {
      subAccountId: { in: liabilityTransferIds },
      isTransfer: true,
    },
    select: {
      subAccountId: true,
      date: true,
      amount: true,
    },
  });

  // 負債口座 ID → 日付ごとの返済額をグループ化
  // 同じプロバイダーに同名の負債口座があると明細が混ざるため，名前ではなく ID で照合する
  // 振替（負債→銀行）の amount は正の値（返済額）
  const incomingTransfers = new Map<string, number>(); // subAccountId::date → 返済額
  for (const tx of allTransfers) {
    const dateStr = formatJSTDate(tx.date);
    const key = `${tx.subAccountId}::${dateStr}`;
    const existing = incomingTransfers.get(key) ?? 0;
    incomingTransfers.set(key, existing + tx.amount);
  }

  let totalSaved = 0;

  for (const sa of subAccounts) {
    // 1. 通常取引を日付→合計額の Map に集約
    const txMap = new Map<string, number>(); // date → 同日の合計 amount
    for (const tx of allTransactions) {
      if (tx.subAccountId !== sa.id) continue;
      const dateStr = formatJSTDate(tx.date);
      if (dateStr > todayStr) continue;
      const existing = txMap.get(dateStr) ?? 0;
      txMap.set(dateStr, existing + tx.amount);
    }

    // 2. 銀行口座からの振替（返済）を追加
    //    同日のスクレイピング取引（購入など）と返済をネット化して合計する
    //    （同日に購入と返済の両方が存在する場合、別々に処理すると逆算時に重複計算になる）
    for (const [key, amount] of incomingTransfers) {
      const [subAccountId, dateStr] = key.split("::");
      if (subAccountId !== sa.id) continue;
      const existing = txMap.get(dateStr) ?? 0;
      txMap.set(dateStr, existing + amount);
    }

    // 日付ごとの集約済み取引を配列に変換
    const txsByDate: Array<{ date: string; amount: number }> = Array.from(
      txMap.entries(),
    ).map(([date, amount]) => ({ date, amount }));

    // 日付昇順でソート
    txsByDate.sort((a, b) => a.date.localeCompare(b.date));

    // 明細がない口座は逆算できないので，既存の履歴（Phase 1 で保存した当日分を含む）を残す
    if (txsByDate.length === 0) {
      logger.debug(
        { subAccount: sa.currentName },
        "⏭️ No transactions — skip liability history recalculation.",
      );
      continue;
    }

    // 逆算: 最新残高から日付ごとに遡る
    // 負債口座: 取引前の残高 = 取引後の残高 - amount
    //   amount > 0 (返済) → 返済前 = 返済後 - 返済額（返済前で大きい負債）
    //   amount < 0 (購入) → 購入前 = 購入後 - 購入額（購入前で小さい負債）
    const dateBalances = new Map<string, number>(); // date → その日の残高
    let balance = sa.balance;

    // 日付降順に処理
    const sortedDesc = [...txsByDate].sort((a, b) =>
      b.date.localeCompare(a.date),
    );

    for (const tx of sortedDesc) {
      dateBalances.set(tx.date, balance);
      balance -= tx.amount; // 取引前（前日終い）の残高
    }

    // gap-filling: 最古取引日〜今日まで
    const entries = new Map<string, number>();
    const sortedAsc = [...txsByDate].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    let currentBalance: number | null = null;

    const todayDate = new Date(`${todayStr}T00:00:00+09:00`);
    // cursor は UTC のメソッドで 1 日ずつ進める．ローカル TZ のメソッドは，夏時間のある TZ で時刻がずれる
    const cursor = new Date(`${sortedAsc[0].date}T00:00:00+09:00`);

    for (const tx of sortedAsc) {
      const txDate = new Date(`${tx.date}T00:00:00+09:00`);

      // cursor〜取引日の前日までを現在の残高で埋める
      while (cursor.getTime() < txDate.getTime()) {
        const d = formatJSTDate(cursor);
        if (currentBalance !== null) {
          entries.set(d, currentBalance);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      // 取引日の残高を記録
      const dayBalance = dateBalances.get(tx.date);
      if (dayBalance === undefined) continue;
      entries.set(tx.date, dayBalance);
      currentBalance = dayBalance;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // 今日までを埋める
    while (cursor.getTime() <= todayDate.getTime()) {
      const d = formatJSTDate(cursor);
      if (!entries.has(d) && currentBalance !== null) {
        entries.set(d, currentBalance);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // 口座ごとに削除と再作成を 1 つのトランザクションで行う．
    // 途中で失敗や中止が起きても，その口座の履歴は再計算前の状態で残る
    const historyRows = Array.from(entries.entries()).map(([dateStr, bal]) => ({
      subAccountId: sa.id,
      date: new Date(`${dateStr}T08:00:00+09:00`),
      balance: bal,
    }));
    await prisma.$transaction([
      prisma.balanceHistory.deleteMany({ where: { subAccountId: sa.id } }),
      prisma.balanceHistory.createMany({ data: historyRows }),
    ]);
    totalSaved += historyRows.length;

    logger.info(
      {
        subAccount: sa.currentName,
        txCount: txsByDate.length,
        historySaved: entries.size,
      },
      "✅ Recalculated liability history.",
    );
  }

  logger.info({ totalSaved }, "✅ Liability history recalculation complete.");
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

const TOTP_PERIOD_MS = 30 * 1000;
// 区切りの残りがこれより短いコードは，入力して送信するまでに期限が切れうる
const TOTP_MIN_REMAINING_MS = 5 * 1000;

/**
 * 送信に使う OTP を取得する．TOTP は 30 秒の区切りごとに変わるので，区切りの残りが短いときと，
 * 前に送ったコードと同じになるとき（同じ区切りの中で再試行したとき）は，次の区切りまで待ってから取り直す
 */
async function retrieveFreshOtp(
  page: Page,
  providerName: string,
  previousOtp?: string,
): Promise<string> {
  const msUntilNextPeriod = () =>
    TOTP_PERIOD_MS - (Date.now() % TOTP_PERIOD_MS);
  if (msUntilNextPeriod() < TOTP_MIN_REMAINING_MS) {
    await page.waitForTimeout(msUntilNextPeriod() + 1000);
  }
  let otp = getItemOtp(providerName);
  if (otp === previousOtp) {
    await page.waitForTimeout(msUntilNextPeriod() + 1000);
    otp = getItemOtp(providerName);
  }
  return otp;
}

/**
 * OTP を送信した後，ログイン後の画面か OTP のエラー文が出るまで待つ．
 * MF の 2FA はページ遷移しないことも遷移することもあり，遷移すると実行コンテキストが壊れて
 * waitForFunction が例外になるので，期限まで待ち直す．期限が来ても例外にはせず，後の verifyLoggedIn に任せる
 */
async function waitForOtpResult(page: Page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await page.waitForFunction(
        () =>
          document.querySelector('a[href="/sign_out"]') !== null ||
          (document.body?.innerText ?? "").includes("コードが間違っています"),
        undefined,
        { timeout: Math.max(deadline - Date.now(), 1) },
      );
      return;
    } catch {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
  }
}

/**
 * MoneyForward にメールアドレスとパスワードでログインし，OTP を求められたら 1Password から取って入力する．
 * OTP が期限切れで弾かれた場合は新しいコードで 2 回まで再試行する．ログインを確認できなければ例外を投げる．
 */
async function loginToMoneyForward(
  page: Page,
  providerName: string,
  email: string,
  password: string,
): Promise<void> {
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

  // count() は待たないため，送信直後に呼ぶと OTP 画面の表示前に 0 を返し，
  // OTP を入力せずに進んでしまう．OTP 入力欄かログイン後の要素が出るまで待つ．
  // どちらも出ない場合は後続の verifyLoggedIn が失敗として扱う
  await page
    .waitForSelector('input[name="otp_attempt"], a[href="/sign_out"]', {
      timeout: 20000,
    })
    .catch(() => {});
  const otpInputFound = await page.locator('input[name="otp_attempt"]').count();
  let lastSubmittedOtp: string | undefined;
  logger.info({ otpInputFound }, "🔑 Checking for OTP input field...");

  if (otpInputFound > 0) {
    logger.info("🔑 Entering OTP (fetching fresh token)...");
    const currentOtp = await retrieveFreshOtp(page, providerName);
    lastSubmittedOtp = currentOtp;
    // OTP コードは認証情報のためログに含めない
    logger.info("🔑 OTP code generated.");

    await page.fill('input[name="otp_attempt"]', currentOtp);
    const filledValue = await page.inputValue('input[name="otp_attempt"]');
    logger.info(
      { match: filledValue === currentOtp },
      "🔑 OTP input verified.",
    );

    await page.click("button#submitto");
    await waitForOtpResult(page);
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
    // 本文とボタンの一覧は，セレクタだけが変わった場合に氏名や資産額を含みうる．
    // 本番（logger は info 以上）に残さないよう debug で出す
    logger.error({ currentUrl, title }, "❌ Login verification failed.");
    logger.debug(
      { bodyText, buttons },
      "Login verification failed: page details.",
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
        const freshOtp = await retrieveFreshOtp(
          page,
          providerName,
          lastSubmittedOtp,
        );
        lastSubmittedOtp = freshOtp;
        // OTP コードは認証情報のためログに含めない
        logger.info({ attempt }, "🔑 Fresh OTP code generated for retry.");

        const otpInput = page.locator('input[name="otp_attempt"]');
        if ((await otpInput.count()) > 0) {
          await otpInput.fill(freshOtp);
          await page.click("button#submitto");
          await waitForOtpResult(page);

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
          { currentUrl: retryUrl, title: retryTitle },
          "❌ Login verification failed after all retries.",
        );
        logger.debug(
          { bodyText: retryBody },
          "Login verification failed after retries: page details.",
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
}

/**
 * MF 側の一括更新が終わるまで，口座一覧を読み込み直しながら読み込み中アイコンが消えるのを待つ．
 * 完了したら true，60 分で打ち切ったら false を返す．打ち切っても例外にはせず，その時点のデータで続ける．
 * アイコンが 0 件でも，口座の表とログアウトのリンクがなければ完了とみなさず例外にする．
 * ログアウトや画面の変更でアイコンが見つからないだけのときに，更新前のデータを取って成功と記録しないため
 */
async function waitForMfSyncToFinish(page: Page): Promise<boolean> {
  logger.info("⏳️ Waiting for sync to complete (max 60 min)...");
  const startTime = Date.now();
  const timeout = 60 * 60 * 1000;

  while (Date.now() - startTime < timeout) {
    // 更新ボタンの送信で別のページへ移っていることがあるので，reload ではなく口座一覧を開き直す
    await page
      .goto("https://moneyforward.com/accounts", {
        waitUntil: "domcontentloaded",
      })
      .catch(error => {
        logger.warn(
          { err: error },
          "⚠️ Failed to reload the accounts page. Checking the current page.",
        );
      });

    const accountTableShown = await page
      .waitForSelector("#account-table", { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    const loggedIn = (await page.locator('a[href="/sign_out"]').count()) > 0;
    if (!accountTableShown || !loggedIn) {
      throw new Error(
        `MF accounts page is not in the expected state while waiting for sync (url: ${page.url()}, accountTable: ${accountTableShown}, loggedIn: ${loggedIn})`,
      );
    }
    // 読み込み中アイコンが描画し終わるまで待つ．通信が続くページでも 10 秒で打ち切る
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});

    const loadingIcons = page.locator('img[src*="loading"]:visible');
    const count = await loadingIcons.count();

    if (count === 0) {
      logger.info("✅ All syncs completed.");
      return true;
    }
    logger.info({ count }, "🔄 Still syncing... accounts updating.");
    // 確認の間隔．MF への負荷を抑えるため，続けて読み込み直さない
    await page.waitForTimeout(10000);
  }

  logger.warn(
    "⚠️ MF sync did not finish within 60 min. Continuing with the current data.",
  );
  return false;
}

/**
 * 正規化した金融機関名から，DB にある子口座名の一覧への Map を作る．
 * scrapeTransactions が明細の子口座名を見分けるのに使う．
 */
async function retrieveSubAccountNamesByInstitution(): Promise<
  Map<string, string[]>
> {
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
  return allSubAccountNames;
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

  // context や page の作成も try の中で行う．失敗したときに finally で
  // ブラウザを閉じ，activeBrowsers とリスナーを片付けるため
  try {
    // headless の既定の UA は HeadlessChrome を含むので，通常の Chrome の UA に置き換える．
    // バージョンを固定すると，Playwright を上げるたびに実際のエンジンと食い違って古くなるので，起動したブラウザから取る．
    // Chrome の UA はメジャー版以外を 0 にする（User-Agent Reduction）
    const chromeMajorVersion = browser.version().split(".")[0];
    const context = await browser.newContext({
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajorVersion}.0.0.0 Safari/537.36`,
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    await loginToMoneyForward(page, providerName, email, password);

    const syncFailures: SyncFailureCounts = new Map();

    if (options.mode === "scheduled") {
      await triggerSync(page, provider.id);

      // 打ち切った場合，一部の口座は更新前のデータになるので，同期の失敗として残す
      if (!(await waitForMfSyncToFinish(page))) {
        countSyncFailure(syncFailures, "mfSyncTimeout");
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
    const allSubAccountNames = await retrieveSubAccountNamesByInstitution();

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
      syncFailures,
    );

    // Phase 4: 取引明細をDBに保存
    logger.info("📋 Phase 4: Saving transactions to database...");
    await saveTransactionsToDatabase(transactions, provider.id, syncFailures);

    // Phase 5: 負債口座の BalanceHistory を逆算（最新残高 + 入出金明細）
    // Phase 5 は DB の明細から負債の履歴を作り直して全件置き換えるので，
    // 明細の取得か保存に失敗していれば実行せず，前回までの正しい履歴を残す
    if (
      syncFailures.has("transactionFetch") ||
      syncFailures.has("transactionSave")
    ) {
      logger.warn(
        { failures: Object.fromEntries(syncFailures) },
        "⚠️ Phase 5 skipped: some transactions failed to fetch or save.",
      );
    } else {
      logger.info("📋 Phase 5: Recalculating liability balance history...");
      await recalculateLiabilityHistory(transactions, provider.id);
    }

    // Phase 5.5: クレジットカードの請求データをスクレイプ・保存
    logger.info("📋 Phase 5.5: Scraping credit card billing data...");
    const liabilities = await fetchLiabilities(page);
    await saveCreditCardBillings(liabilities, provider.id, syncFailures);

    // Phase 6: 残高履歴を過去から取得（非負債口座のみ）
    logger.info("📋 Phase 6: Scraping balance history...");
    await scrapeBalanceHistory(page, provider.id, options, syncFailures);

    // 取得できた分は保存してあるが，欠けがあることを同期の結果として残す
    if (syncFailures.size > 0) {
      throw new Error(
        `Sync finished with partial failures: ${JSON.stringify(Object.fromEntries(syncFailures))}`,
      );
    }

    logger.info("🎉 MF Scraping process completed successfully!");
  } catch (error) {
    logger.error({ err: error }, "❌ Scraping process failed.");
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
    activeBrowsers.delete(provider.id);
    await browser.close();
  }
}

// 直接実行された場合の処理（複数 OP_MF_ITEM_ID 対応）．
// `mise sync` はアプリとは別のプロセスで動くので，DB のロックで画面や自動同期の同期と重ならないようにする
if (isEntry && process.env.OP_MF_ITEM_ID) {
  const itemIds = process.env.OP_MF_ITEM_ID.split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  (async () => {
    // 1 件失敗しても残りのアイテムを処理し，最後に終了コードで失敗を知らせる
    const failedItemIds: string[] = [];
    for (const itemId of itemIds) {
      try {
        // runMfScraper と同じく，プロバイダーがなければ作ってからロックを取る
        const provider = await prisma.provider.upsert({
          where: { name: itemId },
          create: { name: itemId, type: "mf", isActive: true },
          update: {},
        });
        const lockedAt = await acquireSyncLock(provider.id);
        if (!lockedAt) {
          logger.warn(
            { itemId },
            "⚠️ Another sync is running for this provider. Skipping.",
          );
          continue;
        }

        let success = false;
        try {
          logger.info(`🚀 Running scraper for item: ${itemId}`);
          await runMfScraper(itemId);
          success = true;
        } finally {
          await releaseSyncLock(provider.id, lockedAt, success);
        }
      } catch (err) {
        logger.error({ err, itemId }, "❌ Failed to run MF scraper.");
        failedItemIds.push(itemId);
      }
    }
    // 共有の Prisma クライアントは，すべてのアイテムを終えてから 1 回だけ切断する
    await prisma.$disconnect();
    if (failedItemIds.length > 0) {
      logger.error({ failedItemIds }, "❌ Some scrapers failed.");
      process.exitCode = 1;
      return;
    }
    logger.info("✅ All scrapers completed.");
  })();
}
