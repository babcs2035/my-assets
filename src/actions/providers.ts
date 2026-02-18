"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * すべてのプロバイダー情報を取得する関数である．
 * 有効なプロバイダーを優先して取得し，各プロバイダーに紐付くメイン口座の数も併せて取得する．
 */
export async function getProviders() {
  console.log("📂 Fetching providers from database...");
  return prisma.provider.findMany({
    orderBy: { isActive: "desc" },
    include: {
      _count: {
        select: { mainAccounts: true },
      },
    },
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

/**
 * 指定されたプロバイダーの同期処理を実行する関数である．
 */
export async function syncProvider(id: string) {
  console.log(`🔄 Syncing provider: ${id}`);
  // 同期ロジックをここに実装する．現在はシミュレーションとして遅延を入れている．
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(`✅ Sync completed for provider: ${id}`);
  revalidatePath("/settings");
  revalidatePath("/");
}
