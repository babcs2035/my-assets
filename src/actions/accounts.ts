"use server";

import type { AssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type MainAccountCreateInput,
  mainAccountCreateSchema,
  type ProviderCreateInput,
  providerCreateSchema,
} from "@/lib/validations";

/**
 * すべてのメイン口座情報を取得する関数である．
 * 各口座に関連付けられたプロバイダー，サブ口座，保有銘柄，ポイント詳細などを一括で取得する．
 */
export async function getAccounts() {
  console.log("📂 Fetching all accounts from database...");
  return prisma.mainAccount.findMany({
    include: {
      provider: true,
      subAccounts: {
        include: {
          holdings: true,
          cryptos: true,
          pointDetail: true,
        },
      },
    },
    orderBy: { label: "asc" },
  });
}

/**
 * 指定された ID のメイン口座の詳細情報を取得する関数である．
 * 過去 90 日間の残高推移履歴も併せて取得する．
 */
export async function getAccountDetail(id: string) {
  console.log(`🔍 Fetching details for account: ${id}`);
  return prisma.mainAccount.findUnique({
    where: { id },
    include: {
      provider: true,
      subAccounts: {
        include: {
          holdings: {
            orderBy: { valuation: "desc" },
          },
          cryptos: {
            orderBy: { valuation: "desc" },
          },
          pointDetail: true,
          histories: {
            orderBy: { date: "desc" },
          },
        },
      },
    },
  });
}

/**
 * すべてのプロバイダー情報を取得する関数である．
 */
export async function getProviders() {
  console.log("🏢 Fetching providers...");
  return prisma.provider.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * 新しいプロバイダーを作成する関数である．
 */
export async function createProvider(input: ProviderCreateInput) {
  const data = providerCreateSchema.parse(input);
  console.log(`➕ Creating new provider: ${data.name}`);
  return prisma.provider.create({ data });
}

/**
 * 新しいメイン口座を作成する関数である．
 */
export async function createMainAccount(input: MainAccountCreateInput) {
  const data = mainAccountCreateSchema.parse(input);
  console.log(`🏦 Creating new main account: ${data.label}`);
  return prisma.mainAccount.create({ data });
}

/**
 * メイン口座の情報を更新する関数である．
 */
export async function updateMainAccount(
  id: string,
  data: { label?: string; mfUrlId?: string },
) {
  console.log(`📝 Updating main account: ${id}`);
  return prisma.mainAccount.update({
    where: { id },
    data,
  });
}

/**
 * メイン口座を削除する関数である．
 */
export async function deleteMainAccount(id: string) {
  console.log(`🗑️ Deleting main account: ${id}`);
  return prisma.mainAccount.delete({
    where: { id },
  });
}

/**
 * サブ口座の資産タイプを更新する関数である．
 */
export async function updateSubAccountAssetType(
  id: string,
  assetType: AssetType,
) {
  console.log(`🏷️ Updating asset type for sub account ${id} to ${assetType}`);
  return prisma.subAccount.update({
    where: { id },
    data: { assetType },
  });
}

/**
 * サブ口座を別のメイン口座に紐付け直す関数である．
 */
export async function remapSubAccount(
  subAccountId: string,
  newMainAccountId: string,
) {
  console.log(
    `🔗 Remapping sub account ${subAccountId} to main account ${newMainAccountId}`,
  );
  return prisma.subAccount.update({
    where: { id: subAccountId },
    data: { mainAccountId: newMainAccountId },
  });
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
  console.log(`✍️ Creating manual account: ${label} (${subAccountName})`);
  return prisma.mainAccount.create({
    data: {
      providerId,
      label,
      mfUrlId: `MANUAL_${Date.now()}`,
      subAccounts: {
        create: {
          currentName: subAccountName,
          balance: initialBalance,
          assetType,
        },
      },
    },
  });
}
