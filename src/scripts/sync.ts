import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import logger from "../lib/logger";
import { prisma } from "../lib/prisma";

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

  for (const provider of providers) {
    logger.info(`🔄 Syncing provider: [${provider.type}] ${provider.name}`);

    try {
      if (provider.type === "mf") {
        execFileSync("pnpm", ["tsx", "src/scraper/mf-scraper.ts"], {
          env: {
            ...filteredEnv,
            OP_MF_ITEM_ID: provider.name,
            MF_FULL_SYNC: "true",
          },
          stdio: "inherit",
        });
      } else if (provider.type === "custom") {
        const scriptName = provider.scraperScript || "custom-scraper.ts";
        if (!/^[a-zA-Z0-9_-]+\.ts$/.test(scriptName)) {
          logger.error(`❌ Invalid script name: ${scriptName}`);
          continue;
        }
        const scriptPath = resolve("src/scraper", scriptName);
        if (!existsSync(scriptPath)) {
          logger.error(`❌ Script file not found: ${scriptPath}`);
          continue;
        }
        logger.info(`Running custom script: ${scriptPath}`);

        try {
          execFileSync("pnpm", ["tsx", scriptPath], {
            env: { ...filteredEnv, PROVIDER_ID: provider.id },
            stdio: "inherit",
          });
        } catch (error) {
          logger.error(
            { err: error, script: scriptPath, name: provider.name },
            "❌ Failed to run script.",
          );
        }
      } else {
        logger.warn(`Unknown provider type: ${provider.type}`);
      }
    } catch (error) {
      logger.error(
        { err: error, name: provider.name },
        "❌ Failed to sync provider.",
      );
    }
  }

  logger.info("✅ All sync tasks completed.");
}

main()
  .catch(logger.error)
  .finally(() => prisma.$disconnect());
