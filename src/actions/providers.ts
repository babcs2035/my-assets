"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * すべてのプロバイダー情報を取得する関数である．
 * MoneyForward タイプを優先して表示し，有効なプロバイダーを先に表示する．
 */
export async function getProviders() {
  console.log("📂 Fetching providers from database...");
  const providers = await prisma.provider.findMany({
    include: {
      _count: {
        select: { mainAccounts: true },
      },
    },
  });

  // MoneyForward タイプを先頭に，次にカスタムタイプを表示する．
  // 同一タイプ内では有効なものを優先する．
  return providers.sort((a, b) => {
    // タイプ順: mf → custom → その他
    const typeOrder = (t: string) => (t === "mf" ? 0 : t === "custom" ? 1 : 2);
    const typeDiff = typeOrder(a.type) - typeOrder(b.type);
    if (typeDiff !== 0) return typeDiff;

    // 同一タイプ内では有効なものを優先する
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

    return a.name.localeCompare(b.name);
  });
}

/**
 * 新しいプロバイダーを作成する関数である．
 */
export async function createProvider(data: {
  name: string;
  type: string;
  scraperScript?: string;
}) {
  console.log(`➕ Creating new provider: ${data.name}`);
  await prisma.provider.create({
    data: {
      name: data.name,
      type: data.type,
      scraperScript: data.scraperScript || null,
      isActive: true,
    },
  });
  revalidatePath("/settings");
}

/**
 * 指定されたプロバイダーを削除する関数である．
 */
export async function deleteProvider(id: string) {
  console.log(`🗑️ Deleting provider: ${id}`);
  await prisma.provider.delete({
    where: { id },
  });
  revalidatePath("/settings");
}

import { runMfScraper } from "@/scraper/mf-scraper";

/**
 * 指定されたプロバイダーの同期処理を実行する関数である．
 * 同期結果（成功/失敗，日時）を Provider レコードに記録する．
 */
export async function syncProvider(id: string) {
  console.log(`🔄 Syncing provider: ${id}`);

  const provider = await prisma.provider.findUnique({
    where: { id },
  });

  if (!provider) {
    console.error(`❌ Provider not found: ${id}`);
    throw new Error(`Provider not found: ${id}`);
  }

  try {
    console.log(`🚀 Executing scraper for provider: ${provider.name}`);
    await runMfScraper(provider.name);
    console.log(`✅ Sync completed for provider: ${provider.name}`);

    // 同期成功を記録する．
    await prisma.provider.update({
      where: { id },
      data: {
        lastSyncAt: new Date(),
        lastSyncSuccess: true,
      },
    });
  } catch (error) {
    console.error(`❌ Sync failed for provider: ${provider.name}`, error);

    // 同期失敗を記録する．
    await prisma.provider.update({
      where: { id },
      data: {
        lastSyncAt: new Date(),
        lastSyncSuccess: false,
      },
    });

    throw error;
  }

  revalidatePath("/settings");
  revalidatePath("/");
}
