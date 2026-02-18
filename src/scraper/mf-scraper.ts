/**
 * MoneyForward (MF) スクレイパーである．
 * Playwright を使用してマネーフォワードから口座情報および取引明細をスクレイピングする．
 *
 * 使用方法:
 *   pnpm tsx src/scraper/mf-scraper.ts
 *
 * 環境変数:
 *   OP_SERVICE_ACCOUNT_TOKEN: 1Password Service Account トークン
 *   MF_ITEM_NAME: 1Password アイテム名
 */

import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { generateTransactionId } from "@/lib/hash";

const prisma = new PrismaClient();

/**
 * 1Password CLI を使用して，指定されたアイテムからパスワードと TOTP を取得する関数である．
 */
function getCredentials(itemName: string) {
  try {
    const password = execSync(
      `op item get "${itemName}" --fields password --reveal`,
      { encoding: "utf-8" },
    ).trim();

    const totp = execSync(`op item get "${itemName}" --otp`, {
      encoding: "utf-8",
    }).trim();

    return { password, totp };
  } catch (error) {
    console.error("❌ Failed to get credentials from 1Password:", error);
    throw error;
  }
}

/**
 * MF のすべての登録済み金融機関の同期処理をトリガーする関数である．
 */
async function triggerSync(page: import("playwright").Page) {
  console.log("🔄 Triggering sync for all accounts...");
  await page.goto("https://moneyforward.com/accounts");

  const updateButtons = page.locator('input[value="更新"]');
  const count = await updateButtons.count();

  for (let i = 0; i < count; i++) {
    await updateButtons.nth(i).click();
    await page.waitForTimeout(1000);
  }

  console.log(`✅ Triggered sync for ${count} accounts.`);
}

/**
 * 金融機関ごとの口座残高をスクレイピングする関数である．
 */
async function scrapeBalances(page: import("playwright").Page) {
  console.log("💰 Scraping account balances...");

  await page.goto("https://moneyforward.com/accounts");
  await page.waitForSelector(".accounts-table", { timeout: 30000 });

  const accounts = await page.evaluate(() => {
    const rows = document.querySelectorAll(".accounts-table tbody tr");
    const results: Array<{
      institutionName: string;
      subAccountName: string;
      balance: number;
      mfUrlId: string | null;
    }> = [];

    for (const row of rows) {
      const nameCell = row.querySelector(".account-name a");
      const balanceCell = row.querySelector(".number");

      if (nameCell && balanceCell) {
        const href = (nameCell as HTMLAnchorElement).href;
        const mfUrlId = href.match(/accounts\/show\/(\w+)/)?.[1] ?? null;
        const parts = nameCell.textContent?.trim().split(/\s+/) ?? [];

        results.push({
          institutionName: parts[0] ?? "Unknown",
          subAccountName: parts.slice(1).join(" ") || "メイン",
          balance: Number.parseInt(
            balanceCell.textContent?.replace(/[^-\d]/g, "") ?? "0",
            10,
          ),
          mfUrlId,
        });
      }
    }

    return results;
  });

  console.log(`✅ Found ${accounts.length} sub-accounts.`);
  return accounts;
}

/**
 * 直近の入出金明細をスクレイピングする関数である．
 */
async function scrapeTransactions(page: import("playwright").Page) {
  console.log("📝 Scraping transactions...");

  await page.goto("https://moneyforward.com/cf");
  await page.waitForSelector("#cf-detail-table", { timeout: 30000 });

  const transactions = await page.evaluate(() => {
    const rows = document.querySelectorAll("#cf-detail-table tbody tr");
    const results: Array<{
      date: string;
      desc: string;
      amount: number;
      institutionName: string;
      subAccountName: string;
    }> = [];

    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 5) continue;

      const dateText = cells[0]?.textContent?.trim() ?? "";
      const desc = cells[1]?.textContent?.trim() ?? "";
      const amountText = cells[2]?.textContent?.replace(/[^-\d]/g, "") ?? "0";
      const accountText = cells[4]?.textContent?.trim() ?? "";
      const parts = accountText.split(/\s+/);

      results.push({
        date: dateText,
        desc,
        amount: Number.parseInt(amountText, 10),
        institutionName: parts[0] ?? "",
        subAccountName: parts.slice(1).join(" ") || "メイン",
      });
    }

    return results;
  });

  console.log(`✅ Found ${transactions.length} transactions.`);
  return transactions;
}

/**
 * 取得したデータをデータベースに保存する関数である．
 */
async function saveToDatabase(
  balances: Awaited<ReturnType<typeof scrapeBalances>>,
  transactions: Awaited<ReturnType<typeof scrapeTransactions>>,
  providerId: string,
) {
  console.log("💾 Saving data to database...");

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

  for (const tx of transactions) {
    const subAccount = await prisma.subAccount.findFirst({
      where: {
        currentName: tx.subAccountName,
        mainAccount: {
          label: tx.institutionName,
        },
      },
    });

    if (!subAccount) continue;

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
  }

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

  console.log("✅ Data successfully saved to database.");
}

/**
 * スクレイパーのメイン処理である．
 */
async function main() {
  const itemName = process.env.MF_ITEM_NAME ?? "MF_Main";

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

  const { password, totp } = getCredentials(itemName);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("🔐 Logging in to MoneyForward...");
    await page.goto("https://moneyforward.com/sign_in");
    await page.fill('input[name="mfid_user[email]"]', "");
    await page.click('button[type="submit"]');
    await page.fill('input[name="mfid_user[password]"]', password);
    await page.click('button[type="submit"]');

    if (totp) {
      await page.fill('input[name="mfid_user[code]"]', totp);
      await page.click('button[type="submit"]');
    }

    await page.waitForURL("**/", { timeout: 30000 });
    console.log("✅ Logged in successfully.");

    await triggerSync(page);

    console.log("⏳ Waiting for sync to complete (max 60 min)...");
    await page.waitForTimeout(60 * 60 * 1000);

    const balances = await scrapeBalances(page);
    const transactions = await scrapeTransactions(page);

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

main().catch(console.error);
