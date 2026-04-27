# 資産管理システム (my-assets)

個人資産を統合的に管理・可視化するための Web アプリケーションである．
銀行口座，証券口座，暗号資産，ポイントなどの情報を集約し，資産の推移やポートフォリオの構成を詳細に把握することを目的とする．

## 🚀 技術スタック

### Frontend / Backend
- **Next.js 16 (App Router)**: 最新の React フレームワークを採用し，サーバーサイドレンダリング (SSR) による高速な初期表示と SEO 最適化を実現している．
- **TypeScript**: 静的型付けにより，開発時のエラーを未然に防ぎ，保守性の高いコードベースを維持している．
- **Server Actions**: クライアントとサーバー間のシームレスな通信を実現し，API エンドポイントの定義を簡略化している．

### UI / Styling
- **Tailwind CSS 4**: ユーティリティファーストな CSS フレームワークの最新版を使用し，柔軟で高速なスタイリングを行っている．
- **Radix UI**: アクセシビリティに配慮した高品質なヘッドレス UI コンポーネント群を使用している．
- **Lucide React**: メンテナンス性の高い一貫したデザインのアイコンライブラリを採用している．
- **Recharts / Tremor**: インタラクティブで美しいグラフ表示を実現し，資産データの分析を視覚的にサポートしている．

### Database / Infrastructure
- **PostgreSQL**: 堅牢なリレーショナルデータベースを採用し，資産データや取引履歴を安全に保存する．
- **Prisma 7**: 型安全な ORM を使用し，データベース操作を直感的かつ安全に行っている．
- **Docker**: コンテナ化により，開発環境から本番環境まで一貫した動作環境を提供している．

### Automation
- **Playwright**: 強力なブラウザ自動化ツールを用いて，MoneyForward 等の外部サービスから資産データを取得するスクレイピング機能を実装している．
- **1Password CLI (op)**: セキュアな認証情報の取得に使用され，環境変数にパスワードを直書きせずに自動ログインを実現している．
- **Biome 2.3**: 高速な Linter および Formatter として機能し，コードの品質と一貫性を自動的に保持している．

## 🛠 技術的詳細

### 1. スクレイピングの仕組み
スクレイピング処理は `src/scraper/` ディレクトリに集約されている．
- **mf-scraper.ts**: MoneyForward から口座一覧，残高，および直近の入出金明細を取得する．
- **custom-scraper.ts**: 特定の取引所 (例: Coincheck) や独自 API から資産データを取得するためのテンプレートである．
- **認証の自動化**: `op item get` コマンドを使用して 1Password から TOTP (ワンタイムパスワード) やログイン情報を取得し，Playwright で動的な要素に対応しながらログインを完結させる．

### 2. データベース設計思想
データモデルは以下の階層構造を持つ．
- **Provider**: データ取得元 (MoneyForward, 各種取引所など) を管理する．
- **MainAccount**: 金融機関ごとの親口座である．
- **SubAccount**: 普通預金，定期預金，特定の銘柄など，実際に金額を持つ最小単位である．
- **AssetHistory**: 日ごとの資産合計金額を保存し，チャート描画に使用する．

### 3. ダッシュボードのデータフロー
- ダッシュボードの読み込み時に `src/actions/dashboard.ts` のサーバーアクションが実行される．
- 直近 90 日間の `AssetHistory` を集計し，資産タイプごとのプロパティを持つ形式に整形して `DashboardAreaChart` に渡す．
- 各ページは `force-dynamic` に設定されており，常に最新のデータベース状態を反映する設計となっている．

### 4. 開発・品質管理ルール
本プロジェクトでは開発の一貫性を保つため，以下のルールを適用している．
- **ドキュメント・コメント**: すべての主要な関数，コンポーネント，およびコードブロックには詳細な日本語コメントを付随させる．
- **文体**: 句読点には「．」と「，」を使用し，「だ・である」調で記述する．
- **ログ出力**: ユーザー向けのメッセージは日本語，サーバーサイドのデバッグログは英語で統一する．
- **コード品質**: Biome による自動整形と lint チェックを必須とし，CI/CD パイプラインでの品質担保を行う．

## ⚙ セットアップ

本プロジェクトでは，ツールのバージョン管理およびタスク実行に [mise](https://mise.jdx.dev/) を使用することを推奨している．

### 前提条件
- [mise](https://mise.jdx.dev/) がインストールされていること
- Docker & Docker Compose (データベース実行用)
- 1Password CLI (自動ログイン機能を使用する場合)

### 手順

`mise` を使用することで，Node.js や pnpm のインストール，環境変数の設定，データベースの起動，マイグレーション，およびシードデータの投入を一括で行うことができる．

1. **リポジトリのクローン**
   ```bash
   git clone [repository-url]
   cd my-assets
   ```

2. **初期セットアップ (依存関係の導入・DB起動・シード投入)**
   ```bash
   mise run setup
   ```
   ※ `.env.example` から `.env` が未作成の場合は自動的にコピーされる．

3. **開発サーバーの起動**
   ```bash
   mise dev
   ```
   ブラウザで `http://localhost:3000` にアクセスする．

### 利用可能な主な mise タスク

| コマンド                | 内容                                                                            |
| :---------------------- | :------------------------------------------------------------------------------ |
| `mise run setup`        | 環境構築（`.env` 作成，依存関係インストール，DB起動，マイグレーション，シード） |
| `mise dev`              | 開発サーバーの起動                                                              |
| `mise run build`        | 本番用ビルドの実行                                                              |
| `mise run check`        | 型チェックおよびリンターの実行                                                  |
| `mise run sync`         | 各プロバイダーからのデータ同期（スクレイピング）を手動実行                      |
| `mise run db:up`        | データベースコンテナの起動                                                      |
| `mise run db:reset`     | データベースのリセットおよび再シード                                            |
| `mise run db:studio`    | Prisma Studio の起動                                                            |
| `mise run docker:build` | Docker Compose でアプリケーションスタックをビルド                               |
| `mise run docker:up`    | Docker Compose でアプリケーションスタックを起動（app + db）                     |
| `mise run docker:down`  | Docker Compose のアプリケーションスタックを停止                                 |
| `mise run docker:logs`  | Docker Compose のアプリケーションログを追従表示                                 |

---

## 🚢 デプロイ (GitHub Actions)

本リポジトリには `master` への push（または手動実行）で動くデプロイ workflow を用意している．

- Workflow: `.github/workflows/deploy.yml`
- 本番 compose: `docker-compose.production.yml`
- イメージ: `ghcr.io/babcs2035/my-assets`（`latest` と commit SHA タグ）

### 必要な GitHub Secrets

- `TS_OAUTH_CLIENT_ID`
- `TS_OAUTH_SECRET`
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_KEY`
- `DEPLOY_PORT`
- `DEPLOY_TARGET`

### デプロイ先 `.env` の必須項目

少なくとも以下をデプロイ先の `${DEPLOY_TARGET}/.env` に設定すること．

- `POSTGRES_PASSWORD`

必要に応じて以下も設定すること（未設定時は既定値を使用）．

- `POSTGRES_USER`
- `POSTGRES_DB`
- `DB_PORT`（`my-assets-app -> my-assets-db` の内部接続ポート）
- `APP_PORT`
- `TZ`
- `OP_SERVICE_ACCOUNT_TOKEN`
- `OP_VAULT`

Workflow 実行時に `APP_IMAGE` と `IMAGE_TAG` は自動更新され，`docker compose pull && docker compose up -d` で反映される．
