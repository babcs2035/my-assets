/**
 * カスタムスクレイパー (Coincheck 例) である．
 * Playwright を使用して Coincheck から取引履歴 CSV を取得し，資産情報を抽出する．
 */

import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const prisma = new PrismaClient();
const ITEM_NAME = "Coincheck";

/**
 * 1Password CLI を使用してログイン情報を取得する関数である．
 */
async function getCredentials() {
  try {
    console.log(`🔑 Fetching credentials for "${ITEM_NAME}" from 1Password...`);
    let email = "";
    try {
      email = execSync(
        `op item get "${ITEM_NAME}" --fields label=email --reveal`,
        { encoding: "utf-8" },
      ).trim();
    } catch {
      email = execSync(
        `op item get "${ITEM_NAME}" --fields username --reveal`,
        {
          encoding: "utf-8",
        },
      ).trim();
    }

    const password = execSync(
      `op item get "${ITEM_NAME}" --fields password --reveal`,
      { encoding: "utf-8" },
    ).trim();

    let totp = "";
    try {
      totp = execSync(`op item get "${ITEM_NAME}" --otp`, {
        encoding: "utf-8",
      }).trim();
    } catch {
      // TOTP が設定されていない場合は無視する．
    }

    return { email, password, totp };
  } catch (error) {
    console.error(
      "❌ Failed to get credentials. Make sure 1Password CLI is logged in.",
    );
    throw error;
  }
}

/**
 * 通貨の現在レートを取得する関数である．
 */
async function getRate(currency: string): Promise<number> {
  const c = currency.toUpperCase();
  if (c === "JPY" || c === "JP_YEN") return 1;
  try {
    const pair = `${c.toLowerCase()}_jpy`;
    const res = await fetch(`https://coincheck.com/api/rate/${pair}`);
    if (!res.ok) return 0;
    const json = await res.json();
    return Number.parseFloat(json.rate);
  } catch {
    return 0;
  }
}

/**
 * スクレイパーのメイン処理である．
 */
async function main() {
  let providerId = process.env.PROVIDER_ID;
  if (!providerId) {
    const p = await prisma.provider.findFirst({ where: { type: "custom" } });
    if (p) {
      providerId = p.id;
    } else {
      console.warn("⚠️ No custom provider found in database.");
    }
  }

  const { email, password, totp } = await getCredentials();

  console.log("🚀 Starting Coincheck Scraper...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("🔐 Logging in to Coincheck...");
    await page.goto("https://coincheck.com/ja/sessions/signin");

    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    try {
      const otpInput = await page.waitForSelector(
        'input[name="google_authenticator"], input[name="two_factor_auth"]',
        { timeout: 5000 },
      );
      if (otpInput && totp) {
        console.log("🔐 Entering 2FA code...");
        await otpInput.fill(totp);
        await page.click('button[type="submit"]');
      }
    } catch {
      console.log("ℹ️ 2FA input not found or skipped.");
    }

    await page.waitForURL("**/exchange", { timeout: 30000 });
    console.log("✅ Successfully logged in.");

    console.log("📥 Downloading transaction history CSV...");
    await page.goto("https://coincheck.com/ja/exchange/history");

    const downloadPromise = page.waitForEvent("download");
    await page.getByText("CSV", { exact: false }).first().click();

    const download = await downloadPromise;
    const stream = await download.createReadStream();

    const chunks: Buffer[] = [];
    if (stream) {
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
    }
    const csvContent = Buffer.concat(chunks).toString("utf-8");
    console.log(`✅ CSV downloaded (${csvContent.length} bytes).`);

    const lines = csvContent.split(/\r?\n/);
    const headers = lines[0]
      .split(",")
      .map(h => h.trim().replace(/^"|"$/g, ""));
    console.log("📋 CSV headers:", headers);

    const currencyIdx = headers.findIndex(h =>
      ["通貨", "Currency", "Coin"].some(k => h.includes(k)),
    );
    const amountIdx = headers.findIndex(h =>
      ["変動額", "数量", "Amount", "Quantity"].some(k => h.includes(k)),
    );

    const balances = new Map<string, number>();

    if (currencyIdx !== -1 && amountIdx !== -1) {
      console.log("👍 Structured CSV detected. Parsing rows...");
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        if (cols.length < headers.length) continue;

        const currency = cols[currencyIdx].toUpperCase();
        const amount = Number.parseFloat(cols[amountIdx]);

        if (!Number.isNaN(amount) && currency) {
          const current = balances.get(currency) || 0;
          balances.set(currency, current + amount);
        }
      }
    } else {
      console.warn("⚠️ Headers not recognized. Using heuristic parser...");
      const knownCurrencies = [
        "BTC",
        "ETH",
        "XRP",
        "LSK",
        "FCT",
        "XEM",
        "LTC",
        "BCH",
        "MONA",
        "XLM",
        "QTUM",
        "BAT",
        "IOST",
        "ENJ",
        "OMG",
        "PLT",
        "SAND",
        "DOT",
        "FNCT",
        "CHZ",
        "LINK",
        "DAI",
        "MKR",
        "MATIC",
        "APE",
        "AXS",
        "WBTC",
        "AVAX",
        "SHIB",
        "JPY",
      ];

      for (const line of lines) {
        if (line.includes("Date") || line.includes("日時")) continue;
        const parts = line.split(",");
        if (parts.length < 2) continue;
        const cleanParts = parts.map(p => p.replace(/["\s]/g, ""));

        let currency = "";
        let amount = 0;
        for (let i = 0; i < cleanParts.length; i++) {
          const part = cleanParts[i];
          if (knownCurrencies.includes(part.toUpperCase())) {
            currency = part.toUpperCase();
            const prev = Number.parseFloat(cleanParts[i - 1]);
            const next = Number.parseFloat(cleanParts[i + 1]);
            if (!Number.isNaN(prev)) {
              amount = prev;
            } else if (!Number.isNaN(next)) {
              amount = next;
            }
            break;
          }
        }
        if (currency && amount !== 0) {
          const current = balances.get(currency) || 0;
          balances.set(currency, current + amount);
        }
      }
    }

    console.log("💰 Aggregated balances:", Object.fromEntries(balances));

    if (providerId) {
      console.log("💾 Saving aggregated balance data to database...");
      const mainAccount = await prisma.mainAccount.upsert({
        where: { mfUrlId: "COINCHECK_CUSTOM" },
        create: {
          label: "Coincheck (Custom)",
          providerId,
          mfUrlId: "COINCHECK_CUSTOM",
        },
        update: {},
      });

      const subAccount = await prisma.subAccount.upsert({
        where: {
          mainAccountId_currentName: {
            mainAccountId: mainAccount.id,
            currentName: "Spot Account",
          },
        },
        create: {
          mainAccountId: mainAccount.id,
          currentName: "Spot Account",
          balance: 0,
        },
        update: {},
      });

      let totalBalanceJPY = 0;

      for (const [currency, qty] of balances.entries()) {
        if (Math.abs(qty) < 0.000001) continue;

        if (currency === "JPY") {
          totalBalanceJPY += qty;
          continue;
        }

        const rate = await getRate(currency);
        const valuation = Math.floor(qty * rate);

        const existing = await prisma.cryptoAsset.findFirst({
          where: { subAccountId: subAccount.id, symbol: currency },
        });

        if (existing) {
          await prisma.cryptoAsset.update({
            where: { id: existing.id },
            data: { quantity: qty, price: rate, valuation },
          });
        } else {
          await prisma.cryptoAsset.create({
            data: {
              subAccountId: subAccount.id,
              symbol: currency,
              name: currency,
              quantity: qty,
              price: rate,
              valuation,
            },
          });
        }
      }
      await prisma.subAccount.update({
        where: { id: subAccount.id },
        data: { balance: Math.floor(totalBalanceJPY), assetType: "CRYPTO" },
      });

      console.log("✅ Data successfully saved to database.");
    }
  } catch (err) {
    console.error("❌ An error occurred during scraping process:", err);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
