"use server";

import type { AssetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  type MainAccountCreateInput,
  type MainAccountUpdateInput,
  mainAccountCreateSchema,
  mainAccountUpdateSchema,
  type ProviderCreateInput,
  providerCreateSchema,
} from "@/lib/validations";

/**
 * すべてのメイン口座情報を取得する関数である．
 * 各口座に関連付けられたプロバイダー，サブ口座，保有銘柄，ポイント詳細などを一括で取得する．
 */
export async function getAccounts() {
  logger.info("📂 Fetching all accounts from database...");
  return prisma.mainAccount.findMany({
    include: {
      provider: true,
      subAccounts: {
        where: { isHidden: false },
        include: {
          holdings: true,
          cryptos: true,
          pointDetail: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * 口座一覧用の軽量関数である．
 * 一覧表示に必要な最小限のフィールドのみを取得する．
 * holdings, cryptos, pointDetail は取得しない．
 */
export async function getAccountList() {
  logger.info("📂 Fetching account list (lightweight)...");
  return prisma.mainAccount.findMany({
    select: {
      id: true,
      label: true,
      sortOrder: true,
      provider: {
        select: { name: true },
      },
      subAccounts: {
        where: { isHidden: false },
        select: {
          id: true,
          currentName: true,
          balance: true,
          assetType: true,
          mainAccountId: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * 指定された ID のメイン口座の詳細情報を取得する関数である．
 * 残高推移履歴も併せて取得する．
 */
export async function getAccountDetail(id: string) {
  logger.info(`🔍 Fetching details for account: ${id}`);
  return prisma.mainAccount.findUnique({
    where: { id },
    include: {
      provider: true,
      subAccounts: {
        include: {
          mainAccount: { select: { label: true } },
          holdings: {
            orderBy: { valuation: "desc" },
          },
          holdingHistories: {
            orderBy: { date: "asc" },
          },
          cryptos: {
            orderBy: { valuation: "desc" },
          },
          pointDetail: true,
          histories: {
            orderBy: { date: "desc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

/**
 * すべてのプロバイダー情報を取得する関数である．
 */
export async function getProviders() {
  logger.info("🏢 Fetching providers...");
  return prisma.provider.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * 新しいプロバイダーを作成する関数である．
 */
export async function createProvider(input: ProviderCreateInput) {
  const data = providerCreateSchema.parse(input);
  logger.info(`➕ Creating new provider: ${data.name}`);
  const result = await prisma.provider.create({ data });
  revalidatePath("/settings");
  revalidatePath("/accounts");
  return result;
}

/**
 * 新しいメイン口座を作成する関数である．
 */
export async function createMainAccount(input: MainAccountCreateInput) {
  const data = mainAccountCreateSchema.parse(input);
  logger.info(`🏦 Creating new main account: ${data.label}`);
  const result = await prisma.mainAccount.create({
    data: {
      ...data,
      mfUrlId: data.mfUrlId?.trim() || null,
    },
  });
  revalidatePath("/accounts");
  revalidatePath("/");
  return result;
}

/**
 * メイン口座の情報を更新する関数である．
 */
export async function updateMainAccount(
  id: string,
  input: MainAccountUpdateInput,
) {
  const data = mainAccountUpdateSchema.parse(input);
  logger.info(`📝 Updating main account: ${id}`);
  const result = await prisma.mainAccount.update({
    where: { id },
    data,
  });
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  return result;
}

/**
 * メイン口座を削除する関数である．
 */
export async function deleteMainAccount(id: string) {
  logger.info(`🗑️ Deleting main account: ${id}`);
  const result = await prisma.$transaction(async tx => {
    const subAccounts = await tx.subAccount.findMany({
      where: { mainAccountId: id },
      select: { id: true },
    });
    const subAccountIds = subAccounts.map(sa => sa.id);

    if (subAccountIds.length > 0) {
      await tx.balanceHistory.deleteMany({
        where: { subAccountId: { in: subAccountIds } },
      });
      await tx.transaction.deleteMany({
        where: { subAccountId: { in: subAccountIds } },
      });
      await tx.holding.deleteMany({
        where: { subAccountId: { in: subAccountIds } },
      });
      await tx.holdingHistory.deleteMany({
        where: { subAccountId: { in: subAccountIds } },
      });
      await tx.cryptoAsset.deleteMany({
        where: { subAccountId: { in: subAccountIds } },
      });
      await tx.pointDetail.deleteMany({
        where: { subAccountId: { in: subAccountIds } },
      });
      await tx.subAccount.deleteMany({
        where: { id: { in: subAccountIds } },
      });
    }

    return tx.mainAccount.delete({
      where: { id },
    });
  });
  revalidatePath("/accounts");
  revalidatePath("/");
  return result;
}

/**
 * サブ口座の資産タイプを更新する関数である．
 */
export async function updateSubAccountAssetType(
  id: string,
  assetType: AssetType,
) {
  logger.info(`🏷️ Updating asset type for sub account ${id} to ${assetType}`);
  const result = await prisma.subAccount.update({
    where: { id },
    data: { assetType },
  });
  revalidatePath("/accounts");
  revalidatePath("/");
  return result;
}

/**
 * サブ口座の表示状態（非表示/表示）を更新する関数である．
 */
export async function updateSubAccountHidden(id: string, isHidden: boolean) {
  logger.info(`🙈 Updating hidden flag for sub account ${id} to ${isHidden}`);
  const result = await prisma.subAccount.update({
    where: { id },
    data: { isHidden },
    select: {
      id: true,
      mainAccountId: true,
      isHidden: true,
    },
  });
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${result.mainAccountId}`);
  revalidatePath("/");
  revalidatePath("/transactions");
  return result;
}

/**
 * サブ口座を別のメイン口座に紐付け直す関数である．
 */
export async function remapSubAccount(
  subAccountId: string,
  newMainAccountId: string,
) {
  logger.info(
    `🔗 Remapping sub account ${subAccountId} to main account ${newMainAccountId}`,
  );
  const result = await prisma.subAccount.update({
    where: { id: subAccountId },
    data: { mainAccountId: newMainAccountId },
  });
  revalidatePath("/accounts");
  return result;
}

/**
 * 手動管理用の口座を新規作成する関数である．
 * メイン口座とサブ口座を同時に作成し，初期残高を設定する．
 */
export async function createManualAccount({
  providerId,
  label,
  subAccountName,
  initialBalance,
  assetType,
}: {
  providerId: string;
  label: string;
  subAccountName: string;
  initialBalance: number;
  assetType: AssetType;
}) {
  logger.info(`✍️ Creating manual account: ${label} (${subAccountName})`);

  // 新規口座の sortOrder を最大値 + 1 に設定
  const maxSortOrder = await prisma.mainAccount.aggregate({
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  const result = await prisma.mainAccount.create({
    data: {
      providerId,
      label,
      mfUrlId: `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sortOrder: nextSortOrder,
      subAccounts: {
        create: {
          currentName: subAccountName,
          balance: initialBalance,
          assetType,
          sortOrder: 0,
        },
      },
    },
  });
  revalidatePath("/accounts");
  revalidatePath("/");
  return result;
}

/**
 * メイン口座の並び順を更新する関数である．
 * 引数には ID の配列を新しい順序で渡す．
 */
export async function reorderMainAccounts(orderedIds: string[]) {
  logger.info("🔀 Reordering main accounts...");
  const updates = orderedIds.map((id, index) =>
    prisma.mainAccount.update({
      where: { id },
      data: { sortOrder: index },
    }),
  );
  await prisma.$transaction(updates);
  revalidatePath("/accounts");
}

/**
 * サブ口座の並び順を更新する関数である．
 * 引数には ID の配列を新しい順序で渡す．
 */
export async function reorderSubAccounts(orderedIds: string[]) {
  logger.info("🔀 Reordering sub accounts...");
  const updates = orderedIds.map((id, index) =>
    prisma.subAccount.update({
      where: { id },
      data: { sortOrder: index },
    }),
  );
  await prisma.$transaction(updates);
  revalidatePath("/accounts");
}
