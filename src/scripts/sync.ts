import "dotenv/config";
import { execSync } from "node:child_process";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("🚀 Starting sync process...");

  const providers = await prisma.provider.findMany({
    where: { isActive: true },
  });

  if (providers.length === 0) {
    console.warn("⚠️ No active providers found.");
    return;
  }

  for (const provider of providers) {
    console.log(`\n🔄 Syncing provider: [${provider.type}] ${provider.name}`);

    try {
      if (provider.type === "mf") {
        // Run MF scraper with environment variable
        execSync("pnpm tsx src/scraper/mf-scraper.ts", {
          env: {
            ...process.env,
            OP_MF_ITEM_ID: provider.name,
            MF_FULL_SYNC: "true",
          },
          stdio: "inherit",
        });
      } else if (provider.type === "custom") {
        // Run Custom scraper
        const scriptName = provider.scraperScript || "custom-scraper.ts";
        const scriptPath = `src/scraper/${scriptName}`;
        console.log(`Running custom script: ${scriptPath}`);

        try {
          execSync(`pnpm tsx ${scriptPath}`, {
            env: { ...process.env, PROVIDER_ID: provider.id },
            stdio: "inherit",
          });
        } catch (error) {
          console.error(
            `❌ Failed to run script ${scriptPath} for ${provider.name}:`,
            error,
          );
        }
      } else {
        console.warn(`Unknown provider type: ${provider.type}`);
      }
    } catch (error) {
      console.error(`❌ Failed to sync provider ${provider.name}:`, error);
      // Ensure error doesn't stop other providers?
      // For now, continue loop.
    }
  }

  console.log("\n✅ All sync tasks completed.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
