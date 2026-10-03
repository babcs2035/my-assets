import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import logger from "../lib/logger";
import { prisma } from "../lib/prisma";
import { acquireSyncLock, releaseSyncLock } from "../lib/sync-lock";

const filteredEnv = { ...process.env };
delete filteredEnv.OP_SERVICE_ACCOUNT_TOKEN;

async function main() {
  logger.info("🚀 Starting sync process.");

  const providers = await prisma.provider.findMany({
    where: { isActive: true },
  });

  if (providers.length === 0) {
    logger.warn("⚠️ No active providers found.");
    return;
  }

  let failed = false;
  for (const provider of providers) {
    logger.info(`🔄 Syncing provider: [${provider.type}] ${provider.name}`);

    try {
      if (provider.type === "mf") {
        // ロックは mf-scraper.ts の CLI が取る
        execFileSync("pnpm", ["tsx", "src/scraper/mf-scraper.ts"], {
          env: {
            ...filteredEnv,
            OP_MF_ITEM_ID: provider.name,
          },
          stdio: "inherit",
        });
      } else if (provider.type === "custom") {
        const scriptName = provider.scraperScript || "custom-scraper.ts";
        if (!/^[a-zA-Z0-9_-]+\.ts$/.test(scriptName)) {
          throw new Error(`Invalid script name: ${scriptName}`);
        }
        const scriptPath = resolve("src/scraper", scriptName);
        if (!existsSync(scriptPath)) {
          throw new Error(`Script file not found: ${scriptPath}`);
        }

        // custom 型のスクリプトは自分でロックを取らないので，ここで取って結果も記録する
        const lockedAt = await acquireSyncLock(provider.id);
        if (!lockedAt) {
          logger.warn(
            { name: provider.name },
            "⚠️ Another sync is running for this provider. Skipping.",
          );
          continue;
        }
        let success = false;
        try {
          logger.info(`Running custom script: ${scriptPath}`);
          execFileSync("pnpm", ["tsx", scriptPath], {
            env: { ...filteredEnv, PROVIDER_ID: provider.id },
            stdio: "inherit",
          });
          success = true;
        } finally {
          await releaseSyncLock(provider.id, lockedAt, success);
        }
      } else {
        logger.warn(`Unknown provider type: ${provider.type}`);
      }
    } catch (error) {
      failed = true;
      logger.error(
        { err: error, name: provider.name },
        "❌ Failed to sync provider.",
      );
    }
  }

  if (failed) {
    logger.error("❌ Some sync tasks failed.");
    process.exitCode = 1;
    return;
  }
  logger.info("✅ All sync tasks completed.");
}

main()
  .catch(err => {
    logger.error({ err }, "❌ Sync process failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
