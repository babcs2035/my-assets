/**
 * カスタムスクレイパー (Coincheck 例) である．
 * Playwright を使用して Coincheck から取引履歴 CSV を取得し，資産情報を抽出する．
 */

import "dotenv/config";
import { type Browser, chromium } from "playwright";
import logger from "../lib/logger";
import { getItemField, getItemOtp } from "../lib/onepassword";
import { prisma } from "../lib/prisma";

const ITEM_NAME = process.env.OP_CUSTOM_ITEM_ID || "Coincheck";

/**
 * 1Password CLI を使用してログイン情報を取得する関数である．
 */
async function getCredentials() {
  try {
    logger.info(`🔑 Fetching credentials for "${ITEM_NAME}" from 1Password...`);

    const email = getItemField(ITEM_NAME, "username");
    const password = getItemField(ITEM_NAME, "password");

    let totp = "";
    try {
      totp = getItemOtp(ITEM_NAME);
    } catch (_error) {
      // OTP が設定されていない場合は無視する
      logger.info("ℹ️ OTP not configured for this item");
    }

    return { email, password, totp };
  } catch (error) {
    logger.error(
      "❌ Failed to get credentials. Make sure 1Password runtime secrets file is mounted or 1Password CLI is logged in.",
    );
    throw error;
  }
}

/**
 * 通貨の現在レートを取得する関数である．
 * 取得できなければ null を返す．0 を返すと評価額 0 として保存され，資産が消えたように見えるため
 */
async function getRate(currency: string): Promise<number | null> {
  const c = currency.toUpperCase();
  if (c === "JPY" || c === "JP_YEN") return 1;
  try {
    const pair = `${c.toLowerCase()}_jpy`;
    const res = await fetch(`https://coincheck.com/api/rate/${pair}`);
    if (!res.ok) return null;
    const json = await res.json();
    const rate = Number.parseFloat(json.rate);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/**
 * CSV の 1 行を列に分ける関数である．
 * 引用符で囲んだ値の中のカンマ（桁区切りなど）と，`""` による引用符のエスケープを扱う．
 * 値の中の改行は扱わない（行の分割を先に行っているため）
 */
function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch !== '"') {
        current += ch;
      } else if (line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

/**
 * 桁区切りのカンマを含む数値（`1,234.5`）を読む関数である
 */
function parseCsvNumber(value: string | undefined): number {
  return Number.parseFloat((value ?? "").replace(/,/g, ""));
}

/**
 * スクレイパーのメイン処理である．
 */
async function main() {
  let browser: Browser | undefined;
  try {
    let providerId = process.env.PROVIDER_ID;
    if (!providerId) {
      const p = await prisma.provider.findFirst({ where: { type: "custom" } });
      if (p) {
        providerId = p.id;
      } else {
        logger.warn("⚠️ No custom provider found in database.");
      }
    }

    const { email, password, totp } = await getCredentials();

    logger.info("🚀 Starting Coincheck Scraper...");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    logger.info("🔐 Logging in to Coincheck...");
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
        logger.info("🔐 Entering 2FA code...");
        await otpInput.fill(totp);
        await page.click('button[type="submit"]');
      }
    } catch {
      logger.info("ℹ️ 2FA input not found or skipped.");
    }

    await page.waitForURL("**/exchange", { timeout: 30000 });
    logger.info("✅ Successfully logged in.");

    logger.info("📥 Downloading transaction history CSV...");
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
    logger.info(`✅ CSV downloaded (${csvContent.length} bytes).`);

    const lines = csvContent.split(/\r?\n/);
    const headers = splitCsvLine(lines[0]);
    logger.info({ headers }, "📋 CSV headers.");

    const currencyIdx = headers.findIndex(h =>
      ["通貨", "Currency", "Coin"].some(k => h.includes(k)),
    );
    const amountIdx = headers.findIndex(h =>
      ["変動額", "数量", "Amount", "Quantity"].some(k => h.includes(k)),
    );

    const balances = new Map<string, number>();

    if (currencyIdx !== -1 && amountIdx !== -1) {
      logger.info("👍 Structured CSV detected. Parsing rows...");
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const cols = splitCsvLine(line);
        if (cols.length < headers.length) continue;

        const currency = cols[currencyIdx].toUpperCase();
        const amount = parseCsvNumber(cols[amountIdx]);

        if (!Number.isNaN(amount) && currency) {
          const current = balances.get(currency) || 0;
          balances.set(currency, current + amount);
        }
      }
    } else {
      logger.warn("⚠️ Headers not recognized. Using heuristic parser...");
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
        const parts = splitCsvLine(line);
        if (parts.length < 2) continue;
        const cleanParts = parts.map(p => p.replace(/\s/g, ""));

        let currency = "";
        let amount = 0;
        for (let i = 0; i < cleanParts.length; i++) {
          const part = cleanParts[i];
          if (knownCurrencies.includes(part.toUpperCase())) {
            currency = part.toUpperCase();
            const prev = parseCsvNumber(cleanParts[i - 1]);
            const next = parseCsvNumber(cleanParts[i + 1]);
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

    logger.info(
      { balances: Object.fromEntries(balances) },
      "💰 Aggregated balances.",
    );

    if (providerId) {
      logger.info("💾 Saving aggregated balance data to database...");
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
      const heldSymbols: string[] = [];
      const symbolsWithoutRate: string[] = [];

      for (const [currency, qty] of balances.entries()) {
        if (Math.abs(qty) < 0.000001) continue;

        if (currency === "JPY") {
          totalBalanceJPY += qty;
          continue;
        }
        heldSymbols.push(currency);

        const rate = await getRate(currency);
        if (rate === null) {
          // 前回の評価額を残し，最後に同期を失敗にする
          symbolsWithoutRate.push(currency);
          continue;
        }
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
      // 残高がなくなった通貨の行を消す．残すと最後の評価額のまま資産に計上され続ける．
      // CSV から 1 件も読めなかったときは解析の失敗とみなし，消さない
      if (balances.size > 0) {
        await prisma.cryptoAsset.deleteMany({
          where: {
            subAccountId: subAccount.id,
            symbol: { notIn: heldSymbols },
          },
        });
      }
      await prisma.subAccount.update({
        where: { id: subAccount.id },
        data: { balance: Math.floor(totalBalanceJPY), assetType: "CRYPTO" },
      });

      if (symbolsWithoutRate.length > 0) {
        throw new Error(
          `Failed to fetch rates. Kept previous valuations for: ${symbolsWithoutRate.join(", ")}`,
        );
      }
      logger.info("✅ Data successfully saved to database.");
    }
  } finally {
    await browser?.close();
    await prisma.$disconnect();
  }
}

main().catch(err => {
  logger.error({ err }, "❌ An error occurred during scraping process.");
  // sync.ts は終了コードで成否を判定する
  process.exitCode = 1;
});
