import { z } from "zod";

/**
 * プロバイダー (Provider) 作成時のバリデーションスキーマである．
 */
export const providerCreateSchema = z.object({
  name: z.string().min(1, "名前は必須です"),
  type: z.enum(["mf", "custom"]),
});
export type ProviderCreateInput = z.infer<typeof providerCreateSchema>;

/**
 * メイン口座 (MainAccount) 作成時のバリデーションスキーマである．
 */
export const mainAccountCreateSchema = z.object({
  label: z.string().min(1, "金融機関名は必須です"),
  providerId: z.string().min(1, "プロバイダーは必須です"),
  mfUrlId: z.string().optional(),
});
export type MainAccountCreateInput = z.infer<typeof mainAccountCreateSchema>;

/**
 * サブ口座 (SubAccount) 更新時のバリデーションスキーマである．
 */
export const subAccountUpdateSchema = z.object({
  id: z.string(),
  assetType: z.enum(["CASH", "INVESTMENT", "CRYPTO", "POINT"]),
  mainAccountId: z.string().optional(),
});
export type SubAccountUpdateInput = z.infer<typeof subAccountUpdateSchema>;

/**
 * メインカテゴリー (MainCategory) 作成時のバリデーションスキーマである．
 */
export const mainCategoryCreateSchema = z.object({
  name: z.string().min(1, "カテゴリー名は必須です"),
});
export type MainCategoryCreateInput = z.infer<typeof mainCategoryCreateSchema>;

/**
 * サブカテゴリー (SubCategoryItem) 作成時のバリデーションスキーマである．
 */
export const subCategoryCreateSchema = z.object({
  name: z.string().min(1, "サブカテゴリー名は必須です"),
  mainCategoryId: z.string().min(1, "メインカテゴリーは必須です"),
});
export type SubCategoryCreateInput = z.infer<typeof subCategoryCreateSchema>;

/**
 * カテゴリールール (CategoryRule) 作成時のバリデーションスキーマである．
 */
export const categoryRuleCreateSchema = z.object({
  keyword: z.string().min(1, "キーワードは必須です"),
  subCategoryId: z.string().min(1, "サブカテゴリーは必須です"),
  priority: z.number().int().default(0),
});
export type CategoryRuleCreateInput = z.infer<typeof categoryRuleCreateSchema>;

/**
 * 取引 (Transaction) のカテゴリー更新時のバリデーションスキーマである．
 */
export const transactionCategoryUpdateSchema = z.object({
  transactionId: z.string(),
  subCategoryId: z.string().nullable(),
  createRule: z.boolean().default(false),
});
export type TransactionCategoryUpdateInput = z.infer<
  typeof transactionCategoryUpdateSchema
>;

/**
 * 振替 (Transfer) 設定時のバリデーションスキーマである．
 */
export const transferMarkSchema = z.object({
  transactionId1: z.string(),
  transactionId2: z.string(),
});
export type TransferMarkInput = z.infer<typeof transferMarkSchema>;
