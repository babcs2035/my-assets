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
│   ├── components/          # React コンポーネント
│   ├── lib/                 # 共有ライブラリ
│   │   ├── onepassword.ts   # 1Password CLI 連携
│   │   ├── scheduler.ts     # 08:00 JST 自動同期スケジューラ
│   │   └── ...
│   ├── scraper/             # スクレイピングロジック
│   │   ├── mf-scraper.ts    # MoneyForward スクレイパー
│   │   └── custom-scraper.ts# カスタムスクレイパーテンプレート
│   └── scripts/
│       └── sync.ts          # 全プロバイダー同期管理スクリプト
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
- 1Password CLI（認証情報を自動取得する場合）

### 初期セットアップ

```bash
cd my-assets
mise run setup
```

`mise run setup` は以下の処理を自動実行する．

1. `.env.example` から `.env` を生成
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

## アーキテクチャ

### 1. プロバイダー管理 (`Provider` モデル)

外部サービスからのデータ取得は「プロバイダー」という単位で管理される．

| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| `name` | String | プロバイダー名（一意）．MF の場合は 1Password のアイテム名． |
| `type` | String | `"mf"` (MoneyForward) または `"custom"`． |
| `scraperScript` | String? | **(Customのみ)** 実行するスクリプト名（既定: `custom-scraper.ts`）． |
| `isActive` | Boolean | 有効/無効フラグ． |

### 2. 同期システム (`src/scripts/sync.ts`)

`mise sync` コマンドで実行され，全アクティブなプロバイダーを順に同期する．

- **MoneyForward (`mf`)**: `src/scraper/mf-scraper.ts` を実行．
- **Custom (`custom`)**: `src/scraper/` 内の指定されたスクリプトを実行．`PROVIDER_ID` 環境変数が渡される．

### 3. 1Password 連携 (`src/lib/onepassword.ts`)

認証情報を安全に管理するため，1Password と連携する．

- **開発環境**: 1Password CLI (`op`) を直接呼び出してアイテムを取得する．
- **本番環境**: デプロイ時にホスト側で `op` CLI を用いて認証情報を抽出し，`/app/op-secrets.json` としてコンテナにマウントして使用する．
- **サービスアカウント**: `OP_SERVICE_ACCOUNT_TOKEN` を設定することで，ヘッドレス環境での動作に対応する．

### 4. データベースモデル

| モデル | 説明 |
| :--- | :--- |
| `MainAccount` | 金融機関ごとの親口座 |
| `SubAccount` | 普通預金，証券，ポイント等，金額を持つ最小単位 |
| `Transaction` | 入出金明細．振替ペア管理に対応 |
| `BalanceHistory` | 日ごとの残高履歴スナップショット（グラフ用） |
| `CategoryRule` | カテゴリ自動分類のためのキーワードルール |

## デプロイ (GitHub Actions)

`main` への push により，`.github/workflows/deploy.yml` が自動実行される．

### デプロイフロー

1. **Build**: Docker イメージをビルドし，GitHub Container Registry (GHCR) へ push する．
2. **Deploy**: SSH 経由でデプロイ先ホストへ接続．
3. **Secrets Extraction**: ホスト側の `op` CLI を使用し，`OP_SERVICE_ACCOUNT_TOKEN` を用いて認証情報を抽出．`op-secrets.json` を生成する．
4. **Update**: `docker compose pull` および `docker compose up -d` を実行して反映する．

### 必要な環境変数・Secrets

#### GitHub Secrets
- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PORT`, `DEPLOY_TARGET`

#### デプロイ先 `.env`
- `POSTGRES_PASSWORD`: DB パスワード
- `OP_SERVICE_ACCOUNT_TOKEN`: 1Password サービスアカウントトークン
- `OP_VAULT`: 1Password のボルト名
- `OP_MF_ITEM_ID`: MF 用の 1Password アイテム名（既定: `MF_Main`）

## ライセンス

MIT License
