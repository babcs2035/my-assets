import "dotenv/config";
import { execSync } from "node:child_process";
import { generateTransactionId } from "../lib/hash";
import { prisma } from "../lib/prisma";
import { chromium, type Page } from "playwright";

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
  const isAccountsPage = page.url().replace(/\/$/, "") === "https://moneyforward.com/accounts";
  const hasTable = await page.locator("#account-table").count() > 0;

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
      .map((row) => {
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
      .filter((acc) => acc.name && acc.href);
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
  const targetLabels = new Set(mainAccounts.map((a) => a.label));
  console.log(
    `📋 Target accounts for sync: ${Array.from(targetLabels).join(", ")}`,
  );

  const rows = await page.locator("#account-table tbody tr").all();
  let triggeredCount = 0;

  for (const row of rows) {
    const serviceLink = row.locator("td.service a").first();
    if ((await serviceLink.count()) === 0) continue;

    const serviceNameFull = await serviceLink.innerText();
    const serviceName = serviceNameFull.trim(); // aタグ内のみ取得しているのでsplit不要

    if (targetLabels.has(serviceName)) {
      const updateButton = row.locator('form input[type="submit"][value="更新"]');
      if ((await updateButton.count()) > 0 && (await updateButton.isVisible())) {
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
  const targetLabels = new Set(mainAccounts.map((a) => a.label));

  console.log(
    `📋 Target accounts (DB): ${Array.from(targetLabels).join(", ")}`,
  );

  const accounts = await getAccountLinks(page);
  const targetAccounts = accounts.filter((acc) => targetLabels.has(acc.name));

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
            document.querySelectorAll("table.table-bordered"),
          );
        }

        for (const table of tables) {
          const headers = Array.from(table.querySelectorAll("thead th")).map(
            (th) => th.textContent?.trim() || "",
          );
          const amountIdx = headers.findIndex((h) =>
            ["残高", "評価額", "資産"].some((k) => h.includes(k)),
          );
          const nameIndices = headers
            .map((h, i) =>
              ["種類", "名称", "銘柄"].some((k) => h.includes(k)) ? i : -1,
            )
            .filter((i) => i !== -1);

          const rows = Array.from(table.querySelectorAll("tbody tr"));
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll("td"));
            if (cells.length < 2) continue;

            let amountCandidate: number | null = null;
            let subNameCandidate = "";

            // 1. ヘッダーから特定
            if (amountIdx !== -1 && cells[amountIdx]) {
              const numStr =
                cells[amountIdx].textContent?.trim().replace(/[^-\d]/g, "") ??
                "";
              if (numStr) amountCandidate = Number.parseInt(numStr, 10);
            }

            if (nameIndices.length > 0) {
              const parts = nameIndices
                .map((i) => cells[i]?.textContent?.trim())
                .filter((s) => s && s.length > 0);
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

            if (subNameCandidate === "" && amountIdx !== -1) {
              const other = cells.find(
                (c, i) => i !== amountIdx && c.textContent?.trim(),
              );
              if (other)
                subNameCandidate = other.textContent?.trim() || "メイン";
            }

            if (amountCandidate !== null) {
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
        results.push({
          institutionName: account.name,
          subAccountName: "Main",
          balance: 0,
          mfUrlId: account.hash,
        });
      }
    } catch (e) {
      console.error(
        `❌ Failed to scrape balances for ${account.name}:`,
        e,
      );
    }
  }

  console.log(`✅ Collected ${results.length} balances.`);
  return results;
}

/**
 * 直近の入出金明細をスクレイピングする (今月＋先月)
 */
async function scrapeTransactions(page: Page, providerId: string) {
  console.log("📝 Scraping transactions (Current & Previous month)...");

  // DB情報の取得
  const mainAccounts = await prisma.mainAccount.findMany({
    where: { providerId },
    select: {
      label: true,
      subAccounts: { select: { currentName: true } },
    },
  });

  const subAccountMap = new Map<string, string[]>();
  for (const ma of mainAccounts) {
    subAccountMap.set(
      ma.label,
      ma.subAccounts.map((s) => s.currentName),
    );
  }

  if (subAccountMap.size === 0) {
    console.log("⚠️ No registered accounts found for transactions.");
    return [];
  }

  // リンク取得
  const accounts = await getAccountLinks(page);
  const targetAccounts = accounts.filter((acc) =>
    subAccountMap.has(acc.name),
  );

  const allTransactions = [];

  for (const account of targetAccounts) {
    const knownSubNames = subAccountMap.get(account.name) || [];
    knownSubNames.sort((a, b) => b.length - a.length);

    console.log(`Processing transactions for ${account.name}...`);
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
        ({ institutionName, subAccountNames }) => {
          const rows = Array.from(
            document.querySelectorAll(
              "#cf-detail-table tbody.list_body tr.transaction_list",
            ),
          );
          const res = [];
          for (const row of rows) {
            const dateCell = row.querySelector("td.date");
            const dateRaw =
              dateCell?.getAttribute("data-table-sortable-value") ?? "";
            const date = dateRaw.split("-")[0].replace(/\//g, "-");

            const contentCell = row.querySelector("td.content");
            const desc = contentCell?.textContent?.trim() ?? "";

            const amountCell = row.querySelector("td.amount");
            const amountText =
              amountCell?.querySelector("span.offset")?.textContent?.trim() ??
              "0";
            const amount = parseInt(amountText.replace(/,/g, ""), 10);

            const idAttr = row.getAttribute("id");
            const msgUrlId = idAttr ? idAttr.replace("js-transaction-", "") : "";

            const accountCell = row.querySelectorAll("td")[4];
            const accText = accountCell?.textContent?.trim() ?? "";
            const accTitle = accountCell?.getAttribute("title") ?? "";
            const accDataTitle =
              accountCell?.getAttribute("data-original-title") ?? "";
            // すべての情報を統合して判定に使用
            const info = (accText + " " + accTitle + " " + accDataTitle).replace(
              /\s+/g,
              " ",
            );

            let subAccountName = "";
            for (const name of subAccountNames) {
              if (info.includes(name)) {
                subAccountName = name;
                break;
              }
            }
            if (!subAccountName) {
              if (subAccountNames.length === 1)
                subAccountName = subAccountNames[0];
              else subAccountName = "Main";
            }

            if (date) {
              res.push({
                date,
                desc,
                amount,
                institutionName,
                subAccountName,
                msgUrlId,
              });
            }
          }
          return res;
        },
        { institutionName: account.name, subAccountNames: knownSubNames },
      );
    };

    // 月次明細の取得ループ
    const isFullSync = process.env.MF_FULL_SYNC === "true";
    const maxMonths = isFullSync ? 100 : 2; // 全件取得時は最大100ヶ月、通常は2ヶ月
    let monthsCount = 0;

    while (monthsCount < maxMonths) {
      monthsCount++;
      const currentTransactions = await scrapeCurrentPage();
      allTransactions.push(...currentTransactions);

      if (monthsCount >= maxMonths) break;

      const prevBtn = page.locator("button.fc-button-prev");
      if ((await prevBtn.count()) > 0 && (await prevBtn.isVisible())) {
        const headerTitle = page.locator(".fc-header-title h2");
        const currentTitle = await headerTitle.textContent();

        // 前月ボタンをクリックして遷移を待機
        await prevBtn.click();
        try {
          await page.waitForFunction(
            (old) => {
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
 * 取得データをDBに保存する (詳細ログ付き)
 */
async function saveToDatabase(
  balances: Awaited<ReturnType<typeof scrapeBalances>>,
  transactions: Awaited<ReturnType<typeof scrapeTransactions>>,
  providerId: string,
) {
  console.log("💾 Saving data to database...");

  // 1. 口座情報の保存
  for (const account of balances) {
    let mainAccount = await prisma.mainAccount.findFirst({
      where: {
        mfUrlId: account.mfUrlId,
        providerId,
      },
    });

    if (!mainAccount) {
      mainAccount = await prisma.mainAccount.create({
        data: {
          label: account.institutionName,
          providerId,
          mfUrlId: account.mfUrlId,
        },
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

  // 2. 残高履歴の保存 (本日分)
  const today = new Date();
  today.setHours(8, 0, 0, 0);
  const allSubAccounts = await prisma.subAccount.findMany();

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

  // 3. 取引明細の保存
  let savedCount = 0;
  for (const tx of transactions) {
    const subAccount = await prisma.subAccount.findFirst({
      where: {
        currentName: tx.subAccountName,
        mainAccount: {
          label: tx.institutionName,
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
          `   Available DB subAccounts: ${ma.subAccounts.map((s) => `"${s.currentName}"`).join(", ")}`,
        );
      } else {
        console.warn(`   MainAccount "${tx.institutionName}" not found either.`);
      }
      continue;
    }

    const txId = await generateTransactionId(
      subAccount.id,
      tx.date,
      tx.amount,
      tx.desc,
    );

    await prisma.transaction.upsert({
      where: { id: txId },
      create: {
        id: txId,
        subAccountId: subAccount.id,
        date: new Date(tx.date),
        amount: tx.amount,
        desc: tx.desc,
      },
      update: {},
    });
    savedCount++;
  }

  // 4. カテゴリ分類ルールの適用
  const rules = await prisma.categoryRule.findMany({
    orderBy: { priority: "desc" },
  });

  for (const rule of rules) {
    await prisma.transaction.updateMany({
      where: {
        desc: { contains: rule.keyword },
        subCategoryId: null,
      },
      data: {
        subCategoryId: rule.subCategoryId,
      },
    });
  }

  console.log(`✅ Saved ${savedCount}/${transactions.length} transactions to database.`);
}

/**
 * スクレイパーのメイン処理
 */
export async function runMfScraper(itemName: string) {
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

    const balances = await scrapeBalances(page, provider.id);
    const transactions = await scrapeTransactions(page, provider.id);

    await saveToDatabase(balances, transactions, provider.id);

    console.log("🎉 MF Scraping process completed successfully!");
  } catch (error) {
    console.error("❌ Scraping process failed:", error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

// 直接実行された場合の処理
if (process.env.MF_ITEM_NAME) {
  runMfScraper(process.env.MF_ITEM_NAME).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
