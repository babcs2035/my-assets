import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$connect();

  console.log("=== 1. HoldingHistory count ===");
  const histCount = await prisma.holdingHistory.count();
  console.log("HoldingHistory total:", histCount);

  console.log("\n=== 2. Holding count ===");
  const holdingCount = await prisma.holding.count();
  console.log("Holding total:", holdingCount);

  console.log("\n=== 3. Providers ===");
  const providers = await prisma.provider.findMany({
    select: { id: true, name: true, type: true },
  });
  for (const p of providers) {
    console.log(`  - ${p.name} (type=${p.type}, id=${p.id})`);
  }

  console.log("\n=== 4. Main accounts with provider info ===");
  const mainAccounts = await prisma.mainAccount.findMany({
    include: { provider: { select: { name: true, type: true } } },
    orderBy: { sortOrder: "asc" },
  });
  for (const ma of mainAccounts) {
    console.log(
      `  - ${ma.label} (provider=${ma.provider.name}, type=${ma.provider.type}, mfUrlId=${ma.mfUrlId})`,
    );
  }

  console.log("\n=== 5. Sub accounts with holdingHistories count ===");
  const subAccounts = await prisma.subAccount.findMany({
    include: {
      holdingHistories: { select: { id: true, date: true, name: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
  for (const sa of subAccounts) {
    console.log(
      `  - ${sa.currentName} (assetType=${sa.assetType}, histCount=${sa.holdingHistories.length})`,
    );
    if (sa.holdingHistories.length > 0) {
      const names = new Set(sa.holdingHistories.map(h => h.name));
      console.log(`    Names: ${Array.from(names).slice(0, 10).join(", ")}`);
      const dates = sa.holdingHistories.map(h =>
        h.date.toISOString().slice(0, 10),
      );
      dates.sort();
      console.log(`    Date range: ${dates[0]} ~ ${dates[dates.length - 1]}`);
    }
  }

  console.log("\n=== 6. HoldingHistory grouped by name ===");
  const histGroups = await prisma.holdingHistory.groupBy({
    by: ["name"],
    _count: true,
    _min: { date: true },
    _max: { date: true },
  });
  histGroups.sort((a, b) => b._count - a._count);
  for (const g of histGroups.slice(0, 20)) {
    const minDate = g._min?.date?.toISOString().slice(0, 10) ?? "?";
    const maxDate = g._max?.date?.toISOString().slice(0, 10) ?? "?";
    console.log(
      `  - ${g.name}: ${g._count} records, range: ${minDate} ~ ${maxDate}`,
    );
  }

  console.log("\n=== 7. Recent HoldingHistory (last 10) ===");
  const recentHistories = await prisma.holdingHistory.findMany({
    orderBy: { date: "desc" },
    take: 10,
    include: {
      subAccount: { select: { currentName: true, mainAccountId: true } },
    },
  });
  for (const h of recentHistories) {
    console.log(
      `  - ${h.name} (${h.subAccount.currentName}): ${h.date.toISOString().slice(0, 10)} val=${h.valuation}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
