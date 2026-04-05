import "dotenv/config";
import { execSync } from "node:child_process";
import { chromium, type Page } from "playwright";
import { generateTransactionId } from "../lib/hash";
import { prisma } from "../lib/prisma";
import { todayJST } from "../lib/utils";

const normalizeInstitutionName = (name: string) =>
  name.split("(")[0].replace(/\s+/g, " ").trim();

const normalizeLoose = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[()（）「」『』【】\-ー―‐\/・.,]/g, "")
    .toLowerCase();

const isPlaceholderSubAccountName = (name: string) => {
  const n = normalizeLoose(name);
  return n === "main" || n === "メイン";
};

/**
 * 1Password CLI を使用して認証情報を取得する
 */
function getOnePasswordOtp(itemName: string) {
  const vault = process.env.OP_VAULT || "Private";
  return execSync(`op item get "${itemName}" --otp --vault "${vault}"`, {
    encoding: "utf-8",
  }).trim();
}

function getCredentials(itemName: string) {
  const vault = process.env.OP_VAULT || "Private";

  try {
    const email = execSync(
      `op item get "${itemName}" --fields username --vault "${vault}"`,
      { encoding: "utf-8" },
    ).trim();

    const password = execSync(
      `op item get "${itemName}" --fields password --reveal --vault "${vault}"`,
      { encoding: "utf-8" },
    ).trim();

    return { email, password };
  } catch (error) {
    console.error("❌ Failed to get credentials from 1Password:", error);
    throw error;
  }
}

/**
 * アカウント一覧ページから金融機関のリンク情報を取得するヘルパー関数
 */
async function getAccountLinks(page: Page) {
  // 詳細ページ（/accounts/show/xxx）にいる場合も includes("/accounts") がヒットしてしまうので、
  // 厳密なURL比較または要素の存在確認を行う。
  const isAccountsPage =
    page.url().replace(/\/$/, "") === "https://moneyforward.com/accounts";
  const hasTable = (await page.locator("#account-table").count()) > 0;

  if (!isAccountsPage || !hasTable) {
    await page.goto("https://moneyforward.com/accounts");
  }

  try {
    await page.waitForSelector("#account-table", { timeout: 30000 });
  } catch {
    console.warn(`⚠️ Account table not found. Current URL: ${page.url()}`);
    return [];
  }

  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("#account-table tbody tr"))
      .map(row => {
        const serviceLink = row.querySelector("td.service a");
        let name = serviceLink?.textContent?.trim() ?? "Unknown";
        // "(本サイト)" などを除去
        name = name.split("(")[0].trim();
        return {
          hash: row.id,
          name,
          href: (serviceLink as HTMLAnchorElement)?.href ?? null,
        };
      })
      .filter(acc => acc.name && acc.href);
  });
}

/**
 * MF のすべての登録済み金融機関の同期処理をトリガーする
 */
async function triggerSync(page: Page, providerId: string) {
  console.log("🔄 Triggering sync for registered accounts...");

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
  console.log(
    `📋 Target accounts for sync: ${Array.from(targetLabels).join(", ")}`,
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
        console.log(`🔄 Clicking update for: ${serviceName}`);
        await updateButton.click();
        triggeredCount++;
        await page.waitForTimeout(1000);
      }
    }
  }
  console.log(`✅ Triggered sync for ${triggeredCount} accounts.`);
}

/**
 * 金融機関ごとの口座残高をスクレイピングする
 */
async function scrapeBalances(page: Page, providerId: string) {
  console.log("💰 Scraping account balances...");

  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: { label: true },
  });
  const targetLabels = new Set(
    mainAccounts.map(a => normalizeInstitutionName(a.label)),
  );

  console.log(
    `📋 Target accounts (DB): ${Array.from(targetLabels).join(", ")}`,
  );

  const accounts = await getAccountLinks(page);
  const targetAccounts = accounts.filter(acc =>
    targetLabels.has(normalizeInstitutionName(acc.name)),
  );

  console.log(
    `✅ Processing ${targetAccounts.length} accounts matching DB records...`,
  );

  const results: Array<{
    institutionName: string;
    subAccountName: string;
    balance: number;
    mfUrlId: string | null;
  }> = [];

  for (const account of targetAccounts) {
    if (!account.href) continue;

    try {
      await page.waitForTimeout(1000 + Math.random() * 1000);
      await page.goto(account.href, { timeout: 45000 });

      // 詳細ページからサブアカウント情報を抽出
      const subAccounts = await page.evaluate(() => {
        const subResults: Array<{ subName: string; amount: number }> = [];

        // 詳細セクション (#portfolio_det_...) 内のテーブルを優先
        let tables = Array.from(
          document.querySelectorAll("section[id^='portfolio_det_'] table"),
        );
        if (tables.length === 0) {
          tables = Array.from(
            document.querySelectorAll("section.accounts-form table.table-bordered, #accounts-show .span16 table.table-bordered"),
          );
        }

        for (const table of tables) {
          const headers = Array.from(table.querySelectorAll("thead th")).map(
            th => th.textContent?.trim() || "",
          );
          const amountIdx = headers.findIndex(h =>
            ["残高", "評価額", "資産"].some(k => h.includes(k)),
          );
          const nameIndices = headers
            .map((h, i) =>
              ["種類", "名称", "銘柄"].some(k => h.includes(k)) ? i : -1,
            )
            .filter(i => i !== -1);

          const rows = Array.from(table.querySelectorAll("tbody tr"));
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll("td"));
            if (cells.length < 2) continue;

            let amountCandidate: number | null = null;
            let subNameCandidate = "";

            // 1. ヘッダーから特定
            if (amountIdx !== -1 && cells[amountIdx]) {
              const rawText = cells[amountIdx].textContent?.trim() ?? "";
              const numStr = rawText.replace(/[^-\d]/g, "");
              // 「-」のみ (ハイフン) や空文字、数字を含まない場合は 0 とする
              if (numStr && /\d/.test(numStr)) {
                amountCandidate = Number.parseInt(numStr, 10);
              } else {
                // 残高が「-」や空欄の金融機関 (例: 三井住友銀行) に対応
                amountCandidate = 0;
              }
            }

            if (nameIndices.length > 0) {
              const parts = nameIndices
                .map(i => cells[i]?.textContent?.trim())
                .filter(s => s && s.length > 0);
              if (parts.length > 0) subNameCandidate = parts.join(" ");
            }

            // 2. フォールバック
            if (amountCandidate === null) {
              const nameParts: string[] = [];
              for (let i = cells.length - 1; i >= 0; i--) {
                const text = cells[i].innerText.trim();
                const cleanText = text.replace(/,/g, "");

                if (amountCandidate === null) {
                  const isCurrency =
                    (text.includes("円") ||
                      text.includes("pt") ||
                      text.includes("USD")) &&
                    /[0-9]/.test(cleanText);

                  if (isCurrency) {
                    const numStr = cleanText.replace(/[^-\d]/g, "");
                    if (numStr) {
                      amountCandidate = Number.parseInt(numStr, 10);
                      continue;
                    }
                  }
                }
                if (text && subNameCandidate === "") {
                  nameParts.unshift(text);
                }
              }
              if (subNameCandidate === "" && nameParts.length > 0) {
                subNameCandidate = nameParts.join(" ");
              }
            }

            // 数値が "-" や空欄の場合は 0 として扱う（NaN 保存防止）
            if (amountCandidate === null || !Number.isFinite(amountCandidate)) {
              amountCandidate = 0;
            }

            if (subNameCandidate === "" && amountIdx !== -1) {
              const other = cells.find(
                (c, i) => i !== amountIdx && c.textContent?.trim(),
              );
              if (other)
                subNameCandidate = other.textContent?.trim() || "メイン";
            }

            if (amountCandidate !== null && Number.isFinite(amountCandidate)) {
              subResults.push({
                subName:
                  subNameCandidate.replace(/\s+/g, " ").trim() || "メイン",
                amount: amountCandidate,
              });
            }
          }
        }
        return subResults;
      });

      if (subAccounts.length > 0) {
        for (const sa of subAccounts) {
          results.push({
            institutionName: account.name,
            subAccountName: sa.subName,
            balance: sa.amount,
            mfUrlId: account.hash,
          });
        }
      } else {
        console.warn(
          `⚠️ No sub accounts detected from balance table for "${account.name}". Skipping synthetic fallback.`,
        );
      }
    } catch (e) {
      console.error(`❌ Failed to scrape balances for ${account.name}:`, e);
    }
  }

  console.log(`✅ Collected ${results.length} balances.`);
  return results;
}

/**
 * 直近の入出金明細をスクレイピングする (今月＋先月)
 */
async function scrapeTransactions(
  page: Page,
  providerId: string,
  balances: Awaited<ReturnType<typeof scrapeBalances>>,
  allSubAccountNames: Map<string, string[]>, // 全金融機関の子口座名（振替解析用）
) {
  console.log("📝 Scraping transactions (Current & Previous month)...");

  // DB情報の取得
  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: {
      id: true,
      label: true,
      subAccounts: { select: { currentName: true } },
    },
  });

  const accountConfigMap = new Map<
    string,
    { subAccountNames: string[]; hasExistingTransactions: boolean }
  >();

  const balanceSubNamesByInstitution = new Map<string, Set<string>>();
  for (const b of balances) {
    const key = normalizeInstitutionName(b.institutionName);
    if (!balanceSubNamesByInstitution.has(key)) {
      balanceSubNamesByInstitution.set(key, new Set());
    }
    const bucket = balanceSubNamesByInstitution.get(key)!;
    if (!isPlaceholderSubAccountName(b.subAccountName)) {
      bucket.add(b.subAccountName);
    }
  }

  for (const ma of mainAccounts) {
    const txCount = await prisma.transaction.count({
      where: {
        subAccount: {
          mainAccountId: ma.id,
        },
      },
    });
    // allSubAccountNames からも子口座名を取得して統合
    const instKey = normalizeInstitutionName(ma.label);
    const fromAllDb = allSubAccountNames.get(instKey) ?? [];
    accountConfigMap.set(
      instKey,
      {
        subAccountNames: Array.from(
          new Set([
            ...ma.subAccounts.map(s => s.currentName),
            ...(balanceSubNamesByInstitution.get(instKey) ?? []),
            ...fromAllDb,
          ]),
        ),
        hasExistingTransactions: txCount > 0,
      },
    );
  }
  const hasAnyNewAccount = Array.from(accountConfigMap.values()).some(
    config => !config.hasExistingTransactions,
  );

  if (accountConfigMap.size === 0) {
    console.log("⚠️ No registered accounts found for transactions.");
    return [];
  }

  // リンク取得
  const accounts = await getAccountLinks(page);
  const targetAccounts = accounts.filter(acc =>
    accountConfigMap.has(normalizeInstitutionName(acc.name)),
  );

  const allTransactions = [];

  for (const account of targetAccounts) {
    const accountConfig = accountConfigMap.get(
      normalizeInstitutionName(account.name),
    );
    if (!accountConfig) continue;

    const knownSubNames = accountConfig.subAccountNames;
    knownSubNames.sort((a, b) => b.length - a.length);
    
    // 振替解析用に全金融機関の子口座名を統合（長い順でソート）
    const allSubNames = Array.from(
      new Set([
        ...knownSubNames,
        ...Array.from(allSubAccountNames.values()).flat(),
      ]),
    ).sort((a, b) => b.length - a.length);
    
    // 新規口座が1つでもあれば全金融機関をバックフィル対象にする
    const isIncrementalSync =
      accountConfig.hasExistingTransactions && !hasAnyNewAccount;

    console.log(
      `Processing transactions for ${account.name}... (${isIncrementalSync ? "incremental: 2 months" : "backfill to 2023-01"})`,
    );
    await page.waitForTimeout(1000 + Math.random() * 1000);
    await page.goto(account.href);

    const scrapeCurrentPage = async () => {
      try {
        await page.waitForSelector("#cf-detail-table tbody.list_body", {
          timeout: 10000,
        });
      } catch {
        return [];
      }

      return await page.evaluate(
        ({ institutionName, subAccountNames, allSubAccountNamesForTransfer }) => {
          const normalize = (value: string) =>
            value
              .normalize("NFKC")
              .replace(/\s+/g, "")
              .replace(/[()（）「」『』【】\-ー―‐\/・.,]/g, "")
              .toLowerCase();

          const rows = Array.from(
            document.querySelectorAll(
              "#cf-detail-table tbody.list_body tr.transaction_list",
            ),
          );
          const res: Array<{
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
          }> = [];

          for (const row of rows) {
            const dateCell = row.querySelector("td.date");
            const dateRaw =
              dateCell?.getAttribute("data-table-sortable-value") ?? "";
            // dateRaw format: "2024/01/15-0" or "2024-01-15-0"
            // Extract date part (YYYY/MM/DD or YYYY-MM-DD) and normalize to YYYY-MM-DD
            const dateMatch = dateRaw.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
            const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";

            const contentCell = row.querySelector("td.content");
            const desc = contentCell?.textContent?.trim() ?? "";

            const amountCell = row.querySelector("td.amount");
            const amountText =
              amountCell?.querySelector("span.offset")?.textContent?.trim() ??
              "0";
            const amount = parseInt(amountText.replace(/,/g, ""), 10);
            if (!Number.isFinite(amount)) continue;

            // 振替かどうかをチェック
            let isTransfer = amountCell?.textContent?.includes("(振替)") ?? false;

            const idAttr = row.getAttribute("id");
            const msgUrlId = idAttr
              ? idAttr.replace("js-transaction-", "")
              : "";

            const accountCell = row.querySelectorAll("td")[4];
            const accText = accountCell?.textContent?.trim() ?? "";
            const accTitle = accountCell?.getAttribute("title") ?? "";
            const accDataTitle =
              accountCell?.getAttribute("data-original-title") ?? "";

            // 振替の場合、元と先の子口座名をパース
            // 例: "住信SBIネット銀行 109 代表口座 - 円普通 7089114から住信SBIネット銀行 109 SBIハイブリッド預金 7089114への振替"
            let transferFromSubAccount: string | undefined;
            let transferToSubAccount: string | undefined;

            if (accDataTitle) {
              const transferMatch =
                accDataTitle.match(/(.+?)から(.+?)への振替/);
              if (transferMatch) {
                isTransfer = true;
                const fromPart = transferMatch[1];
                const toPart = transferMatch[2];
                const normalizedFromPart = normalize(fromPart);
                const normalizedToPart = normalize(toPart);

                // 振替の子口座名を抽出（全金融機関の子口座名を使用、長い順でマッチング）
                for (const name of allSubAccountNamesForTransfer) {
                  const normalizedName = normalize(name);
                  if (
                    !transferFromSubAccount &&
                    (fromPart.includes(name) ||
                      normalizedFromPart.includes(normalizedName))
                  ) {
                    transferFromSubAccount = name;
                  }
                  if (
                    !transferToSubAccount &&
                    (toPart.includes(name) ||
                      normalizedToPart.includes(normalizedName))
                  ) {
                    transferToSubAccount = name;
                  }
                }

                // 片側しか特定できない場合は、現在の金融機関の子口座から補完を試みる
                if (
                  (!transferFromSubAccount || !transferToSubAccount) &&
                  subAccountNames.length >= 2
                ) {
                  const remaining = subAccountNames.filter(
                    name =>
                      name !== transferFromSubAccount &&
                      name !== transferToSubAccount,
                  );
                  if (!transferFromSubAccount && remaining.length === 1) {
                    transferFromSubAccount = remaining[0];
                  }
                  if (!transferToSubAccount && remaining.length === 1) {
                    transferToSubAccount = remaining[0];
                  }
                }
              }
            }

            // すべての情報を統合して判定に使用
            // 振替でない明細では td.content に子口座名が入るケースがあるため desc も含める。
            const info = (
              desc +
              " " +
              accText +
              " " +
              accTitle +
              " " +
              accDataTitle
            ).replace(/\s+/g, " ");
            const normalizedInfo = normalize(info);
            const normalizedDesc = normalize(desc);

            let subAccountName = "";
            for (const name of subAccountNames) {
              const normalizedName = normalize(name);
              if (
                info.includes(name) ||
                normalizedInfo.includes(normalizedName) ||
                normalizedDesc.includes(normalizedName)
              ) {
                subAccountName = name;
                break;
              }
            }
            // 完全一致でも補完
            if (!subAccountName) {
              for (const name of subAccountNames) {
                if (desc === name || desc.includes(name) || name.includes(desc)) {
                  subAccountName = name;
                  break;
                }
              }
            }
            if (!subAccountName) {
              if (subAccountNames.length === 1) {
                subAccountName = subAccountNames[0];
              } else if (isTransfer && transferFromSubAccount && transferToSubAccount) {
                const candidate = amount < 0 ? transferFromSubAccount : transferToSubAccount;
                // candidate が現在の金融機関の子口座として存在する場合のみ採用する
                if (subAccountNames.includes(candidate)) {
                  subAccountName = candidate;
                } else {
                  subAccountName = "";
                }
              } else {
                subAccountName = "";
              }
            }

            if (date && subAccountName) {
              res.push({
                date,
                desc,
                amount,
                institutionName,
                subAccountName,
                msgUrlId,
                rawInfo: info,
                isTransfer,
                transferFromSubAccount,
                transferToSubAccount,
              });
            }
          }
          return res;
        },
        {
          institutionName: account.name,
          subAccountNames: knownSubNames,
          allSubAccountNamesForTransfer: allSubNames,
        },
      );
    };

    // 月次明細の取得ループ
    // - 既存データあり: 過去2ヶ月を取得・更新
    // - データなし(初回): 2023年1月まで遡って取得
    const maxMonths = isIncrementalSync
      ? 2
      : Number(process.env.MF_MAX_SYNC_MONTHS ?? 240);
    const minSyncMonth = "2023-01";
    let monthsCount = 0;

    while (monthsCount < maxMonths) {
      monthsCount++;
      const currentTransactions = await scrapeCurrentPage();
      allTransactions.push(...currentTransactions);

      if (!isIncrementalSync) {
        const reachedMinMonth = currentTransactions.some(tx => {
          const month = tx.date.slice(0, 7);
          return month <= minSyncMonth;
        });
        if (reachedMinMonth) {
          console.log(
            `  ⏹ Reached minimum sync month (${minSyncMonth}) for ${account.name}`,
          );
          break;
        }
      }

      const prevBtn = page.locator("button.fc-button-prev");
      if ((await prevBtn.count()) > 0 && (await prevBtn.isVisible())) {
        const headerTitle = page.locator(".fc-header-title h2");
        const currentTitle = await headerTitle.textContent();

        // 前月ボタンをクリックして遷移を待機
        await prevBtn.click();
        try {
          await page.waitForFunction(
            old => {
              const el = document.querySelector(".fc-header-title h2");
              return el && el.textContent !== old;
            },
            currentTitle,
            { timeout: 10000 },
          );
          await page.waitForTimeout(1000);
        } catch {
          console.warn(`  ℹ️ Cannot navigate further back for ${account.name}`);
          break;
        }
      } else {
        break;
      }
    }
  }

  console.log(`✅ Found ${allTransactions.length} transactions.`);
  return allTransactions;
}

/**
 * 残高履歴ページから過去の残高を取得する（全金融機関対象）
 * URL: https://moneyforward.com/bs/history/list/{YYYY-MM-DD}
 * 履歴ページには全金融機関のデータが含まれるため、一度のループで全口座を処理する。
 */
async function scrapeBalanceHistory(page: Page) {
  console.log("📊 Scraping balance history from history pages (all accounts)...");

  // DB から全金融機関と子口座を取得
  const mainAccounts = await prisma.mainAccount.findMany({
    include: { subAccounts: true },
  });

  if (mainAccounts.length === 0) {
    console.log("⚠️ No main accounts found for balance history.");
    return;
  }

  const targetInstitutions = new Set(
    mainAccounts.map(ma => normalizeInstitutionName(ma.label)),
  );

  // 各金融機関の子口座を残高でソートしたマップを作成（マッチング用）
  // 同一金融機関で複数の子口座がある場合、残高の順序で対応付ける
  const subAccountsByInstitution = new Map<
    string,
    Array<{ id: string; currentName: string; balance: number }>
  >();
  for (const ma of mainAccounts) {
    const key = normalizeInstitutionName(ma.label);
    // 同一金融機関名が複数プロバイダーに存在する可能性があるため、追加する
    const existing = subAccountsByInstitution.get(key) ?? [];
    const subs = ma.subAccounts.map(sa => ({
      id: sa.id,
      currentName: sa.currentName,
      balance: sa.balance,
    }));
    subAccountsByInstitution.set(key, [...existing, ...subs]);
  }

  // 残高降順でソート
  for (const [key, subs] of subAccountsByInstitution) {
    subs.sort((a, b) => b.balance - a.balance);
  }

  // 日付範囲: 今日から 2023-01-01 まで
  const today = todayJST();
  const minDate = new Date("2023-01-01T00:00:00+09:00");
  const currentDate = new Date(today);
  currentDate.setHours(8, 0, 0, 0);

  let totalSaved = 0;
  let daysProcessed = 0;

  while (currentDate >= minDate) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    const url = `https://moneyforward.com/bs/history/list/${dateStr}`;

    try {
      await page.goto(url, { timeout: 30000 });
      await page.waitForTimeout(500 + Math.random() * 500);

      // テーブルが存在するか確認
      const tableExists = await page.locator("#history-list").count();
      if (tableExists === 0) {
        console.warn(`  ⚠️ No history table found for ${dateStr}`);
        currentDate.setDate(currentDate.getDate() - 1);
        continue;
      }

      // テーブルから残高データを抽出
      const historyData = await page.evaluate(() => {
        const rows = Array.from(
          document.querySelectorAll("#history-list tbody tr"),
        );
        return rows.map(row => {
          const cells = row.querySelectorAll("td");
          const institution = cells[0]?.textContent?.trim() ?? "";
          const assetType = cells[1]?.textContent?.trim() ?? "";
          const amountText = cells[2]?.textContent?.trim() ?? "0";
          const amount = parseInt(amountText.replace(/[^-\d]/g, ""), 10) || 0;
          return { institution, assetType, amount };
        });
      });

      // 金融機関ごとにグループ化
      const groupedByInstitution = new Map<
        string,
        Array<{ assetType: string; amount: number }>
      >();
      for (const row of historyData) {
        const key = normalizeInstitutionName(row.institution);
        if (!targetInstitutions.has(key)) continue;

        if (!groupedByInstitution.has(key)) {
          groupedByInstitution.set(key, []);
        }
        groupedByInstitution.get(key)!.push({
          assetType: row.assetType,
          amount: row.amount,
        });
      }

      // 子口座とマッチングして保存
      const historyDate = new Date(dateStr + "T08:00:00+09:00");

      for (const [instKey, amounts] of groupedByInstitution) {
        const subAccounts = subAccountsByInstitution.get(instKey);
        if (!subAccounts) continue;

        // 同一金融機関の行を金額降順でソート（子口座の残高順と対応させる）
        const sortedAmounts = [...amounts].sort((a, b) => b.amount - a.amount);

        // 子口座数と行数の対応
        const matchCount = Math.min(subAccounts.length, sortedAmounts.length);

        for (let i = 0; i < matchCount; i++) {
          const sa = subAccounts[i];
          const balance = sortedAmounts[i].amount;

          // NaN チェック
          if (!Number.isFinite(balance)) continue;

          await prisma.balanceHistory.upsert({
            where: {
              subAccountId_date: {
                subAccountId: sa.id,
                date: historyDate,
              },
            },
            create: {
              subAccountId: sa.id,
              date: historyDate,
              balance,
            },
            update: {
              balance,
            },
          });
          totalSaved++;
        }
      }

      daysProcessed++;
      if (daysProcessed % 30 === 0) {
        console.log(`  📅 Processed ${daysProcessed} days (current: ${dateStr})...`);
      }
    } catch (e) {
      console.warn(`  ⚠️ Failed to scrape history for ${dateStr}:`, e);
    }

    currentDate.setDate(currentDate.getDate() - 1);
  }

  console.log(
    `✅ Balance history scraping complete: ${totalSaved} records saved over ${daysProcessed} days.`,
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
  console.log("💾 Saving balances to database...");

  // 口座情報の保存
  for (const account of balances) {
    if (!Number.isFinite(account.balance)) {
      console.warn(
        `⚠️ Skip invalid balance: Inst="${account.institutionName}", Sub="${account.subAccountName}", balance=${String(account.balance)}`,
      );
      continue;
    }

    let mainAccount = null;

    // 既存口座への紐付けは、まず「プロバイダー + 金融機関名」で行う。
    mainAccount = await prisma.mainAccount.findFirst({
      where: {
        providerId,
        label: account.institutionName,
      },
    });

    // 名称一致がない場合のみ mfUrlId でも探索
    if (!mainAccount && account.mfUrlId) {
      mainAccount = await prisma.mainAccount.findFirst({
        where: {
          providerId,
          mfUrlId: account.mfUrlId,
        },
      });
    }

    if (!mainAccount) {
      mainAccount = await prisma.mainAccount.create({
        data: {
          label: account.institutionName,
          providerId,
          mfUrlId: account.mfUrlId,
        },
      });
    } else if (!mainAccount.mfUrlId && account.mfUrlId) {
      mainAccount = await prisma.mainAccount.update({
        where: { id: mainAccount.id },
        data: { mfUrlId: account.mfUrlId },
      });
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

  console.log(`✅ Saved ${balances.length} balance records to database.`);
}

/**
 * 取引明細をDBに保存する関数
 */
async function saveTransactionsToDatabase(
  transactions: Awaited<ReturnType<typeof scrapeTransactions>>,
  providerId: string,
) {
  console.log("💾 Saving transactions to database...");
  const normalize = normalizeLoose;

  // 初回/追加時に備えて、取引明細から子口座候補を先に作成・更新する
  const candidateSubAccountsByInstitution = new Map<string, Set<string>>();
  for (const tx of transactions) {
    if (!candidateSubAccountsByInstitution.has(tx.institutionName)) {
      candidateSubAccountsByInstitution.set(tx.institutionName, new Set());
    }
    const bucket = candidateSubAccountsByInstitution.get(tx.institutionName)!;

    if (tx.subAccountName && !isPlaceholderSubAccountName(tx.subAccountName)) {
      bucket.add(tx.subAccountName);
    }
    // 注意: transferFromSubAccount や transferToSubAccount は他の金融機関の口座である可能性が高いため、
    // 現在の tx.institutionName の子口座として登録してはいけません。
  }

  for (const [institutionName, subNames] of candidateSubAccountsByInstitution) {
    const mainAccount = await prisma.mainAccount.findFirst({
      where: { providerId, label: institutionName },
    });
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
    subAccountsByInstitution.get(key)!.push(sa);
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
          date: new Date(date + "T00:00:00+09:00"), // JST timezone
          amount,
          desc,
          isTransfer,
        },
        update: {
          // 既存のトランザクションは更新しない（冪等性を保つ）
        },
      });
      savedCount++;
    } catch (error) {
      console.error(`❌ Failed to save transaction: ${txId}`, error);
    }
  };

  const buildTransferPairs = async (mainAccountId: string) => {
    const unresolved = await prisma.transaction.findMany({
      where: {
        subAccount: { mainAccountId },
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
    // 全子口座を長い名前順にソート（より具体的な名前を優先）
    const sortedAll = [...allSubAccountsInDb].sort(
      (a, b) => b.currentName.length - a.currentName.length,
    );
    
    // 完全一致を優先
    const exactMatch = sortedAll.find(sa => sa.currentName === name);
    if (exactMatch) return exactMatch;
    
    // 正規化した名前での部分一致
    const normalizedName = normalize(name);
    const normalizedRawInfo = normalize(rawInfo);
    
    for (const sa of sortedAll) {
      const normalizedSaName = normalize(sa.currentName);
      // rawInfo 内に子口座名が含まれているかチェック
      if (normalizedRawInfo.includes(normalizedSaName)) {
        // さらに、渡された name 部分にも含まれているか確認
        if (normalizedName.includes(normalizedSaName) || name.includes(sa.currentName)) {
          return sa;
        }
      }
    }
    
    return undefined;
  };

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
      
      let fromSubAccount: typeof allSubAccountsInDb[number] | undefined;
      let toSubAccount: typeof allSubAccountsInDb[number] | undefined;
      
      if (transferMatch) {
        const fromPart = transferMatch[1];
        const toPart = transferMatch[2];
        
        // 全金融機関の子口座から振替元・振替先を検索
        fromSubAccount = findSubAccountByName(tx.transferFromSubAccount ?? "", fromPart);
        toSubAccount = findSubAccountByName(tx.transferToSubAccount ?? "", toPart);
        
        // スクレイピング時に特定された名前でも再検索
        if (!fromSubAccount && tx.transferFromSubAccount) {
          fromSubAccount = allSubAccountsInDb.find(
            sa => sa.currentName === tx.transferFromSubAccount
          );
        }
        if (!toSubAccount && tx.transferToSubAccount) {
          toSubAccount = allSubAccountsInDb.find(
            sa => sa.currentName === tx.transferToSubAccount
          );
        }
      } else {
        // rawInfo がない場合は、スクレイピング時の情報を使用
        if (tx.transferFromSubAccount) {
          fromSubAccount = allSubAccountsInDb.find(
            sa => sa.currentName === tx.transferFromSubAccount
          );
        }
        if (tx.transferToSubAccount) {
          toSubAccount = allSubAccountsInDb.find(
            sa => sa.currentName === tx.transferToSubAccount
          );
        }
      }

      // 振替先/元が解決できない場合、現在行として見えている側だけ通常明細として保存
      if (!fromSubAccount || !toSubAccount) {
        // 見えている側の子口座を探す
        const visibleSideAccount = allSubAccountsInDb.find(
          sa => 
            sa.currentName === tx.subAccountName &&
            normalizeInstitutionName(sa.mainAccount.label) === normalizeInstitutionName(tx.institutionName)
        );
        if (visibleSideAccount) {
          console.warn(
            `⚠️ Transfer counterpart unresolved. Saving visible side only: sub="${tx.subAccountName}", from="${tx.transferFromSubAccount ?? "?"}", to="${tx.transferToSubAccount ?? "?"}", msgId=${tx.msgUrlId}`,
          );
          await saveSingleTransaction(
            visibleSideAccount.id,
            tx.date,
            tx.amount,
            tx.desc,
            false,
          );
        } else {
          console.warn(
            `⚠️ Transfer accounts unresolved and visible side not found: from="${tx.transferFromSubAccount ?? "?"}", to="${tx.transferToSubAccount ?? "?"}", visible="${tx.subAccountName}", msgId=${tx.msgUrlId}`,
          );
        }
        continue;
      }

      const absAmount = Math.abs(tx.amount);
      const fromName = fromSubAccount.currentName;
      const toName = toSubAccount.currentName;
      const transferDesc = `振替: ${fromName} → ${toName}`;

      // 振替の両方の記録をアトミックに処理
      try {
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

        await prisma.$transaction(async (txPrisma) => {
          // 振替元に出金を記録
          await txPrisma.transaction.upsert({
            where: { id: fromTxId },
            create: {
              id: fromTxId,
              subAccountId: fromSubAccount.id,
              date: new Date(tx.date + "T00:00:00+09:00"),
              amount: -absAmount,
              desc: transferDesc,
              isTransfer: true,
              linkedTransId: toTxId,
            },
            update: {
              linkedTransId: toTxId,
            },
          });

          // 振替先に入金を記録
          await txPrisma.transaction.upsert({
            where: { id: toTxId },
            create: {
              id: toTxId,
              subAccountId: toSubAccount.id,
              date: new Date(tx.date + "T00:00:00+09:00"),
              amount: absAmount,
              desc: transferDesc,
              isTransfer: true,
              linkedTransId: fromTxId,
            },
            update: {
              linkedTransId: fromTxId,
            },
          });
        });

        savedCount += 2;

        // 金融機関が異なる場合は明示
        const fromInst = fromSubAccount.mainAccount.label;
        const toInst = toSubAccount.mainAccount.label;
        const crossInstitution = fromInst !== toInst ? ` (${fromInst} → ${toInst})` : "";
        console.log(
          `  ✅ Transfer recorded: ${fromName} → ${toName}${crossInstitution} (¥${absAmount.toLocaleString()})`,
        );
      } catch (error) {
        console.error(`❌ Failed to save transfer: ${tx.date} ${fromName} → ${toName}`, error);
      }
      continue;
    }

    // 通常の取引（振替でない、または振替情報が不完全な場合）
    let subAccount = await prisma.subAccount.findFirst({
      where: {
        currentName: tx.subAccountName,
        mainAccount: {
          label: tx.institutionName,
          providerId,
        },
      },
    });

    if (!subAccount) {
      console.warn(
        `⚠️ Unmatched transaction: Inst="${tx.institutionName}", Sub="${tx.subAccountName}" not found in DB. MsgId: ${tx.msgUrlId}`,
      );
      // Debug info
      const ma = await prisma.mainAccount.findFirst({
        where: { label: tx.institutionName, providerId },
        include: { subAccounts: true },
      });
      if (ma) {
        console.warn(
          `   Available DB subAccounts: ${ma.subAccounts.map(s => `"${s.currentName}"`).join(", ")}`,
        );
        // フォールバック1: MF側で "Main" になった場合、子口座が1つならそこへ紐付ける
        if (
          isPlaceholderSubAccountName(tx.subAccountName) &&
          ma.subAccounts.length === 1
        ) {
          subAccount = ma.subAccounts[0];
          console.warn(
            `   ↪ Fallback matched to the only sub account: "${subAccount.currentName}"`,
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
            console.warn(
              `   ↪ Fallback matched by description to "${subAccount.currentName}"`,
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
              console.warn(
                `   ↪ Fallback matched by normalized text to "${subAccount.currentName}"`,
              );
            } else {
              console.warn(
                `   ↪ Skip creating "Main": could not uniquely resolve existing sub account`,
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
          const normalizedText = normalize(`${tx.subAccountName} ${tx.desc} ${rawInfo}`);
          const normalizedMatched = sortedCandidates.filter(sa =>
            normalizedText.includes(normalize(sa.currentName)),
          );
          if (normalizedMatched.length === 1) {
            subAccount = normalizedMatched[0];
            console.warn(
              `   ↪ Fallback matched by normalized text to "${subAccount.currentName}"`,
            );
          }
        }
      } else {
        console.warn(
          `   MainAccount "${tx.institutionName}" not found either.`,
        );
      }
    }

    if (!subAccount) {
      // スキップされたトランザクションを詳細にログ出力
      console.warn(
        `⚠️ TRANSACTION SKIPPED: Could not match any account. ` +
        `Institution="${tx.institutionName}", Sub="${tx.subAccountName}", ` +
        `Date="${tx.date}", Desc="${tx.desc}", Amount=${tx.amount}, MsgId=${tx.msgUrlId}`,
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

  console.log(
    `✅ Saved ${savedCount}/${transactions.length} transactions to database.`,
  );
}

// アクティブなブラウザインスタンスを追跡（中止用）
const activeBrowsers = new Map<string, { browser: ReturnType<typeof chromium.launch> extends Promise<infer T> ? T : never; providerId: string }>();

/**
 * 指定されたプロバイダーのスクレイパーを中止する
 */
export async function abortMfScraper(providerId: string) {
  console.log(`🛑 Attempting to abort scraper for provider: ${providerId}`);
  const entry = Array.from(activeBrowsers.values()).find(e => e.providerId === providerId);
  if (entry) {
    try {
      await entry.browser.close();
      console.log(`✅ Browser closed for provider: ${providerId}`);
    } catch (err) {
      console.error(`⚠️ Error closing browser for provider: ${providerId}`, err);
    }
  }
}

/**
 * スクレイパーのメイン処理
 */
export async function runMfScraper(itemName: string, signal?: AbortSignal) {
  console.log("🚀 Starting MF Scraper...");
  console.log(`📦 Using 1Password item: ${itemName}`);

  let provider = await prisma.provider.findFirst({
    where: { name: itemName },
  });

  if (!provider) {
    provider = await prisma.provider.create({
      data: {
        name: itemName,
        type: "mf",
        isActive: true,
      },
    });
  }

  const { email, password } = getCredentials(itemName);

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
    console.log("🛑 Abort signal received, closing browser...");
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
    console.log("🔐 Logging in to MoneyForward...");
    await page.goto("https://moneyforward.com/sign_in");

    if (!page.url().includes("id.moneyforward.com")) {
      console.log(`Current URL: ${page.url()}`);
    }

    try {
      await page.waitForSelector('input[name="mfid_user[email]"]', {
        timeout: 20000,
      });
    } catch {
      console.log(`Login form not found. Current URL: ${page.url()}`);
      throw new Error("Login form not found");
    }
    console.log("📧 Submitting email...");
    await page.fill('input[name="mfid_user[email]"]', email);
    await page.click("button#submitto");

    console.log("⏳ Waiting for password field...");
    await page.waitForSelector('input[name="mfid_user[password]"]');
    console.log("🔑 Submitting password...");
    await page.fill('input[name="mfid_user[password]"]', password);
    await page.click("button#submitto");

    try {
      await page.waitForSelector('input[name="otp_attempt"]', {
        timeout: 5000,
      });
      console.log("🔑 Entering OTP (Fetching fresh token)...");
      const currentOtp = getOnePasswordOtp(itemName);
      await page.fill('input[name="otp_attempt"]', currentOtp);
      await page.click("button#submitto");
      await page.waitForTimeout(3000);
    } catch {
      console.log("ℹ️ No OTP required or OTP input skipped.");
    }

    // ログイン成功確認要素（ログアウトリンク）
    const isLoggedIn = await page.evaluate(() => {
      return document.querySelector('a[href="/sign_out"]') !== null;
    });

    if (!isLoggedIn) {
      console.error("❌ Login Verification Failed.");
      console.error(`Current URL: ${page.url()}`);
      console.error(`Page Title: ${await page.title()}`);
      console.log("🔍 Dumping page content for debugging...");
      console.log(await page.content());
      throw new Error(
        "Login verification failed: User appears not to be logged in.",
      );
    }

    console.log("✅ Logged in successfully (Verified).");

    await triggerSync(page, provider.id);

    console.log("⏳ Waiting for sync to complete (max 60 min)...");
    const startTime = Date.now();
    const timeout = 60 * 60 * 1000;

    while (Date.now() - startTime < timeout) {
      await page.reload();
      await page.waitForTimeout(5000);

      const loadingIcons = page.locator('img[src*="loading"]:visible');
      const count = await loadingIcons.count();

      if (count === 0) {
        console.log("✅ All syncs completed.");
        break;
      }
      console.log(`🔄 Still syncing... (${count} accounts updating)`);
      await page.waitForTimeout(10000);
    }

    // Phase 1: 全金融機関の残高をスクレイプし、子口座をDBに登録
    console.log("📋 Phase 1: Scraping balances and registering sub-accounts...");
    const balances = await scrapeBalances(page, provider.id);
    
    // 残高データから子口座を先にDBに登録
    await saveBalancesToDatabase(balances, provider.id);

    // Phase 2: 全金融機関の全子口座名を収集
    console.log("📋 Phase 2: Collecting all sub-account names from DB...");
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
    console.log(`  ✅ Found ${allMainAccounts.length} institutions with ${Array.from(allSubAccountNames.values()).flat().length} sub-accounts total.`);

    // Phase 3: 入出金明細・振替をスクレイプ（全子口座情報を使用）
    console.log("📋 Phase 3: Scraping transactions with full sub-account knowledge...");
    const transactions = await scrapeTransactions(page, provider.id, balances, allSubAccountNames);

    // Phase 4: 取引明細をDBに保存
    console.log("📋 Phase 4: Saving transactions to database...");
    await saveTransactionsToDatabase(transactions, provider.id);

    // Phase 5: 残高履歴を過去から取得（2023-01-01 まで遡る、全金融機関対象）
    console.log("📋 Phase 5: Scraping balance history...");
    await scrapeBalanceHistory(page);

    console.log("🎉 MF Scraping process completed successfully!");
  } catch (error) {
    console.error("❌ Scraping process failed:", error);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
    activeBrowsers.delete(provider.id);
    await browser.close();
    await prisma.$disconnect();
  }
}

// 直接実行された場合の処理
if (process.env.MF_ITEM_NAME) {
  runMfScraper(process.env.MF_ITEM_NAME).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
