# スクレイパー・プロバイダー仕様書

本ドキュメントでは、金融資産データ取得のためのスクレイパーおよびプロバイダー管理の仕様と実装について整理します。

## 1. 概要

本システムでは、MoneyForward をはじめとする外部サービスからのデータ取得（スクレイピング）を、「プロバイダー (Provider)」という単位で管理します。
プロバイダー設定に基づき、統合同期スクリプト (`src/scripts/sync.ts`) が適切なスクレーパーを呼び出すアーキテクチャを採用しています。

## 2. データモデル (Provider)

全てのデータ連携設定は `Provider` モデルで管理されます。

| カラム名        | 型            | 説明                                                                                                                  |
| :-------------- | :------------ | :-------------------------------------------------------------------------------------------------------------------- |
| `id`            | String (CUID) | 一意な識別子                                                                                                          |
| `name`          | String        | プロバイダー名 (一意)。<br>- **MFの場合**: 1Password のアイテム名 (例: `MF_Main`)<br>- **Customの場合**: 任意の表示名 |
| `type`          | String        | プロバイダータイプ (`"mf"` または `"custom"`)                                                                         |
| `scraperScript` | String?       | **(Customのみ)** 実行するスクリプトファイル名。<br>未指定時は `custom-scraper.ts` がデフォルトとして使用されます。    |
| `isActive`      | Boolean       | 有効/無効フラグ。`false` の場合、同期対象から除外されます。                                                           |

## 3. 同期プロセス (Sync Process)

データ同期は `mise sync` コマンドにより実行されます。
実体は `src/scripts/sync.ts` であり、以下のフローで処理を行います。

1.  **プロバイダー取得**: `Active: true` である全ての `Provider` レコードをデータベースから取得します。
2.  **ループ処理**: 各プロバイダーに対し、`type` に応じて以下の処理を実行します。

### MoneyForward (`type: "mf"`)
*   **実行コマンド**: `pnpm tsx src/scraper/mf-scraper.ts`
*   **環境変数**: `MF_ITEM_NAME` に `provider.name` を設定して渡します。
*   **認証**: 1Password CLI (`op`) を使用して、指定されたアイテム名からログイン情報を取得します。

### Custom / Manual (`type: "custom"`)
*   **実行コマンド**: `pnpm tsx src/scraper/custom-scraper.ts` (デフォルト)
    *   `scraperScript` カラムに値がある場合は、`src/scraper/{scraperScript}` を実行します。
*   **環境変数**: `PROVIDER_ID` に `provider.id` を設定して渡します。
*   **用途**: 独自のAPI連携や、特定のサイト用のスクレイピングロジックを実装する場合に使用します。

## 4. MF スクレイパー詳細 (`src/scraper/mf-scraper.ts`)

MoneyForward アグリゲーションサイトに対するスクレイピングを実行します。

**処理フロー**:
1.  **Credentials取得**: 環境変数 `MF_ITEM_NAME` を基に、`op item get` コマンドで ID/Password/TOTP を取得します。
2.  **ログイン**: Playwright を使用してヘッドレスブラウザでログインします。
3.  **データ更新トリガー**: 全ての連携口座に対して「更新」ボタンを押下します。
4.  **待機**: データ更新反映待ちとして、最大 **60分間** 待機します (MF側の仕様による待機時間)。
5.  **データ取得**:
    *   口座一覧ページ (`/accounts`) から口座名と残高を取得。
    *   入出金ページ (`/cf`) から直近のトランザクションを取得。
6.  **DB保存 (`upsert`)**:
    *   `MainAccount` (金融機関)
    *   `SubAccount` (口座)
    *   `Transaction` (明細) - 重複除外ロジック含む
    *   `BalanceHistory` (残高履歴スナップショット)
7.  **自動カテゴリ適用**: `CategoryRule` に基づき、未分類の明細にカテゴリを適用します。

## 5. Custom スクレイパー詳細 (`src/scraper/custom-scraper.ts`)

ユーザーが自由に実装できるスクリプトのテンプレートです。

**実装に必要なこと**:
1.  **環境変数**: `process.env.PROVIDER_ID` を受け取る。
2.  **データ取得**: 独自のロジックで外部サイトやAPIからデータを取得する。
    *   Playwright, Axios, Puppeteer 等任意のライブラリを使用可能。
3.  **DB保存**: Prisma Client を使用して標準スキーマ (`MainAccount`, `SubAccount`, `Transaction` 等) にデータを保存する。

**サンプルコード**:
```typescript
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const providerId = process.env.PROVIDER_ID;
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  
  // 1. Fetch Data
  const data = await fetchMyData();

  // 2. Save Data using Prisma
  await prisma.subAccount.create({ ... });
}
main();
```

## 6. 実装状況ステータス

| コンポーネント      | ステータス     | 備考                                                                             |
| :------------------ | :------------- | :------------------------------------------------------------------------------- |
| **Provider Schema** | ✅ 実装済       | `prisma/schema.prisma`                                                           |
| **Settings UI**     | ✅ 実装済       | `settings-content.tsx` にて追加・編集可能                                        |
| **Sync Script**     | ✅ 実装済       | `src/scripts/sync.ts`。MF/Custom の振り分けに対応。                              |
| **MF Scraper**      | ✅ 実装済       | 1Password連携、更新トリガー、データ取得、保存まで完備。                          |
| **Custom Scraper**  | ⚠️ テンプレート | `src/scraper/custom-scraper.ts` は現在空の実装（ログ出力のみ）。個別実装が必要。 |
