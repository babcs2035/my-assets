# my-assets

個人資産を統合的に管理・可視化するための Web アプリケーションである．
銀行口座，証券口座，暗号資産，ポイントなどの情報を集約し，資産の推移やポートフォリオの構成を詳細に把握することを目的とする．

## 主な機能

- **ダッシュボード**: 純資産，総資産，総負債の KPI と前日比を表示し，積み上げ面グラフによる資産推移，ドーナツチャートによる資産構成比を可視化する．
- **残高一覧**: 金融機関・口座別の一覧表示とグラフによる残高の推移把握．
- **入出金明細**: カレンダーベースの取引一覧とページネーション．
- **資金振替の自動認識**: 他口座間の振替を自動検出し，ペアとして処理する．
- **自動カテゴリ分類**: ルールベースのキーワードマッチングによる取引明細のカテゴリ付け．
- **ポイント期限通知**: 有効期限が近いポイントを警告表示する．
- **外部サービス連携 (スクレイピング)**: MoneyForward をはじめとする外部サービスから Playwright によるブラウザ自動化で資産データを取得する．
- **1Password 連携**: 1Password CLI (`op`) を介して認証情報を取得し，安全にログインを自動化する．
- **毎日自動同期**: 08:00 JST に全プロバイダーのデータを自動取得するスケジューラを内蔵する．

## 技術スタック

| カテゴリー | 技術 |
| :--- | :--- |
| フレームワーク | Next.js 16 (App Router), React 19 |
| 言語 | TypeScript |
| UI | Tailwind CSS 4, Radix UI, shadcn/ui, Tremor, Recharts, Lucide React |
| データベース | PostgreSQL 16, Prisma 7 |
| スクレイピング | Playwright |
| CI/CD | GitHub Actions |
| コンテナ | Docker / Docker Compose |
| 型チェッカー | tsc |
| Linter / Formatter | Biome 2.4 |
| タスクランナー | mise |

## プロジェクト構造

```
my-assets/
├── prisma/
│   ├── schema.prisma        # データベーススキーマ
│   ├── seed.ts              # シードデータ（デフォルトカテゴリ等）
│   └── migrations/
├── src/
│   ├── app/                 # Next.js App Router のページ・レイアウト
│   │   ├── page.tsx         # ダッシュボード
│   │   ├── accounts/        # 残高一覧ページ
│   │   ├── transactions/    # 入出金明細ページ
│   │   ├── settings/        # 設定ページ
│   │   └── api/sync/        # 手動同期 API エンドポイント
│   ├── actions/             # Server Actions (dashboard, accounts, categories 等)
│   ├── components/
│   │   ├── accounts/        # 残高関連コンポーネント
│   │   ├── charts/          # グラフ関連コンポーネント
│   │   ├── dashboard/       # ダッシュボード用コンポーネント
│   │   ├── settings/        # 設定用コンポーネント
│   │   ├── transactions/    # 明細関連コンポーネント
│   │   └── ui/              # shadcn/ui コンポーネント
│   ├── lib/
│   │   ├── chart-format.ts  # グラフデータの整形
│   │   ├── chart-time-range.ts
│   │   ├── hash.ts          # 取引 ID の決定論的ハッシュ生成
│   │   ├── onepassword.ts   # 1Password CLI 連携
│   │   ├── prisma.ts        # Prisma クライアント singleton
│   │   ├── scheduler.ts     # 08:00 JST 自動同期スケジューラ
│   │   └── utils.ts         # ユーティリティ関数
│   ├── scraper/
│   │   ├── mf-scraper.ts    # MoneyForward スクレイパー
│   │   └── custom-scraper.ts# カスタムスクレイパーテンプレート
│   └── scripts/
│       └── sync.ts          # 全プロバイダー同期スクリプト
├── docs/                      # 設計ドキュメント
├── public/
├── docker-compose.yml         # 開発用 Docker Compose
├── docker-compose.production.yml  # 本番用 Docker Compose
├── Dockerfile
├── mise.toml                  # mise タスク定義
└── package.json
```

## セットアップ

### 前提条件

- [mise](https://mise.jdx.dev/) がインストールされていること
- Docker & Docker Compose
- 1Password CLI（スクレイピング機能を使用する場合）

### 初期セットアップ

```bash
cd my-assets
mise run setup
```

`mise run setup` は以下の処理を自動実行する．

1. `.env.example` から `.env` を生成（既存の場合は上書きしない）
2. 依存関係のインストール (`pnpm install`)
3. PostgreSQL コンテナの起動 (`docker compose up -d db`)
4. マイグレーションの実行 (`prisma migrate dev`)
5. Prisma クライアントの再生成 (`prisma generate`)
6. シードデータの投入 (`prisma db seed`)

### 開発サーバーの起動

```bash
mise dev
```

ブラウザで `http://localhost:3000` にアクセスする．

### 利用可能な主な mise タスク

| コマンド | 内容 |
| :--- | :--- |
| `mise run setup` | 環境構築（`.env` 作成，依存関係インストール，DB 起動，マイグレーション，シード） |
| `mise dev` | 開発サーバーの起動 |
| `mise run build` | 本番用ビルドの実行 |
| `mise run check` | 型チェックおよびリンターの実行 |
| `mise run format` | Biome によるコード整形 |
| `mise run lint:fix` | Biome による Lint 修正 |
| `mise run sync` | 全プロバイダーからのデータ同期（スクレイピング）を手動実行 |
| `mise run db:up` | データベースコンテナの起動 |
| `mise run db:down` | データベースコンテナの停止 |
| `mise run db:reset` | データベースのリセットおよび再シード |
| `mise run db:studio` | Prisma Studio の起動 |
| `mise run docker:build` | Docker Compose でアプリケーションスタックをビルド |
| `mise run docker:up` | Docker Compose でアプリケーションスタックを起動（app + db） |
| `mise run docker:down` | Docker Compose のアプリケーションスタックを停止 |
| `mise run docker:logs` | Docker Compose のアプリケーションログを追従表示 |

## アーキテクチャ

### データベース設計

データモデルは以下の階層構造を持つ．

| モデル | 説明 |
| :--- | :--- |
| `Provider` | データ取得元（MoneyForward，各種取引所等）の定義 |
| `MainAccount` | 金融機関ごとの親口座 |
| `SubAccount` | 普通預金，定期預金，特定の銘柄等，実際に金額を持つ最小単位 |
| `BalanceHistory` | 日ごとの資産合計スナップショット（チャート描画用） |
| `Transaction` | 入出金明細．振替ペア管理 (`isTransfer`, `linkedTransId`) に対応 |
| `MainCategory` / `SubCategoryItem` | カテゴリ分類の階層 |
| `CategoryRule` | 明細の説明文からカテゴリを自動分類するキーワードルール |
| `Holding` | 投資信託の保有銘柄情報 |
| `CryptoAsset` | 暗号資産の保有情報 |
| `PointDetail` | ポイント詳細（有効期限付き） |

### スクレイピングの仕組み

スクレイピング処理は `src/scraper/` ディレクトリに集約されている．

- **mf-scraper.ts**: MoneyForward から口座一覧，残高，入出金明細，残高履歴を取得する．
- **custom-scraper.ts**: 独自の API やサイトからデータを取得するためのテンプレート．
- **認証**: 1Password CLI (`op`) を介して認証情報を取得し，Playwright でブラウザ自動化しながらログインする．
- **同期フロー**: `mise sync` または每天早上 08:00 JST のスケジューラが全アクティブなプロバイダーを順に処理する．

### ダッシュボードのデータフロー

1. ダッシュボードの読み込み時に `src/actions/dashboard.ts` のサーバーアクションが実行される．
2. 直近 90 日間の `BalanceHistory` を集計し，資産タイプごとのプロパティを持つ形式に整形してグラフに渡す．
3. 各ページは `force-dynamic` に設定されており，常に最新のデータベース状態を反映する．

### ローディング状態の管理

ローディング状態はコンポーネント単位で管理される．グローバルなオーバーレイは存在せず，各コンポーネントが自身のローディングインジケーターを表示する責任を持つ．複数のカードが同時に読み込まれる場合，各カードが独立してローディング表示を行う．

## デプロイ (GitHub Actions)

本リポジトリには `main` への push（または手動実行）で動くデプロイ workflow を用意している．

- Workflow: `.github/workflows/deploy.yml`
- 本番 compose: `docker-compose.production.yml`
- イメージ: `ghcr.io/babcs2035/my-assets`（`latest` と commit SHA タグ）

### 必要な GitHub Secrets

| シークレット | 説明 |
| :--- | :--- |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| `TS_OAUTH_SECRET` | Tailscale OAuth secret |
| `DEPLOY_HOST` | デプロイ先ホスト |
| `DEPLOY_USER` | デプロイ先ユーザー |
| `DEPLOY_KEY` | SSH 秘密鍵 |
| `DEPLOY_PORT` | SSH ポート |
| `DEPLOY_TARGET` | デプロイ先ディレクトリ |

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
- `OP_MF_ITEM_ID`（1Password の MF アイテム名）

Workflow 実行時に `APP_IMAGE` と `IMAGE_TAG` は自動更新され，`docker compose pull && docker compose up -d` で反映される．

### デプロイ先での 1Password CLI のセットアップ

`src/scraper/mf-scraper.ts` では `op` (1Password CLI) コマンドを実行して認証情報を取得する．本番環境でスクレイピング機能を使用する場合，デプロイ先のホストに 1Password CLI をインストール・認証する必要がある．

**セットアップ手順:**

1. **1Password CLI のインストール** (Ubuntu/Debian の例)

   ```bash
   curl -sS https://downloads.1password.com/linux/keys/1password.asc | gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg
   echo "deb [signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" | sudo tee /etc/apt/sources.list.d/1password.list
   sudo apt-get update && sudo apt-get install -y 1password-cli
   ```

2. **1Password への認証**

   ```bash
   op signin <your-1password-account>
   ```

3. **アイテムの確認**

   ```bash
   op item list --vault "your-vault-name"
   op item get "MF_Main" --fields username --vault "your-vault-name"
   ```

デプロイ時に `docker-compose.production.yml` がホストの `/usr/bin/op` をコンテナにマウントするため，上記のセットアップが完了していれば，Docker コンテナ内からも `op` コマンドが利用可能になる．
