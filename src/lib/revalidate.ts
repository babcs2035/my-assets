// Server Actions から再検証するページを名前付きの関数で提供するモジュールである．
// Server Actions では revalidatePath を直接呼ばず，このモジュールの関数を用いる．

import { revalidatePath, updateTag } from "next/cache";

/**
 * ダッシュボードのデータを `unstable_cache` で保存するときのタグである．
 * `src/actions/dashboard.ts` は "use server" で定数を export できないため，破棄する側のこのモジュールに置く
 */
export const DASHBOARD_CACHE_TAGS = {
  kpi: "dashboard",
  assetHistory: "asset-history",
  expiringPoints: "expiring-points",
} as const;

/**
 * ダッシュボードのキャッシュをすべて破棄する関数である．
 * revalidatePath はページの再描画だけで `unstable_cache` の中身は残るため，同期直後でも
 * 最長 300 秒は前の KPI と推移が出ていた (DASH-13)．updateTag は Server Action からしか呼べない
 */
function expireDashboardCache(): void {
  for (const tag of Object.values(DASHBOARD_CACHE_TAGS)) {
    updateTag(tag);
  }
}

/**
 * 再検証対象となるページのパスを一元管理する定数である．
 * App Router のルート定義 (src/app 以下) と対応させる．
 */
const PAGE_PATHS = {
  dashboard: "/",
  accounts: "/accounts",
  settings: "/settings",
  transactions: "/transactions",
} as const;

/**
 * 設定ページだけを再検証する関数である．
 * 並び順やルールの編集のように，設定画面の表示にしか影響しない変更で用いる．
 */
export function revalidateSettingsPage(): void {
  revalidatePath(PAGE_PATHS.settings);
}

/**
 * 取引ページだけを再検証する関数である．
 * 取引の分類や振替の紐付けのように，取引一覧にしか影響しない変更で用いる．
 */
export function revalidateTransactionsPage(): void {
  revalidatePath(PAGE_PATHS.transactions);
}

/**
 * 口座一覧ページだけを再検証する関数である．
 * 並び順の変更のように，集計値が変わらない変更で用いる．
 * リテラルのパスを渡すため，口座詳細ページ (/accounts/[id]) は再検証されない．
 */
export function revalidateAccountsPage(): void {
  revalidatePath(PAGE_PATHS.accounts);
}

/**
 * 指定したメイン口座の詳細ページだけを再検証する関数である．
 * 詳細ページは動的ルート (src/app/accounts/[id]) のため，ID からリテラルのパスを組み立てる．
 * ルートパターンと type を渡すと全口座の詳細ページが対象になるため，その方法は用いない．
 */
export function revalidateAccountDetailPage(mainAccountId: string): void {
  revalidatePath(`${PAGE_PATHS.accounts}/${mainAccountId}`);
}

/**
 * 設定ページと取引ページを再検証する関数である．
 * カテゴリーや振替ルールのように，設定画面で編集した内容が
 * 取引一覧の表示にも反映される変更で用いる．
 */
export function revalidateSettingsAndTransactionPages(): void {
  revalidatePath(PAGE_PATHS.settings);
  revalidatePath(PAGE_PATHS.transactions);
}

/**
 * 口座ページとダッシュボードを再検証する関数である．
 * 口座の増減や残高の変化がダッシュボードの集計にも影響する変更で用いる．
 */
export function revalidateAccountAndDashboardPages(): void {
  revalidatePath(PAGE_PATHS.accounts);
  revalidatePath(PAGE_PATHS.dashboard);
  expireDashboardCache();
}

/**
 * 設定ページとダッシュボードを再検証する関数である．
 * プロバイダーの同期のように，設定画面での操作が
 * ダッシュボードの資産表示にも影響する変更で用いる．
 */
export function revalidateSettingsAndDashboardPages(): void {
  revalidatePath(PAGE_PATHS.settings);
  revalidatePath(PAGE_PATHS.dashboard);
  expireDashboardCache();
}
