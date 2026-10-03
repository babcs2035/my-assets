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
- **毎日自動同期**: 08:00 JST に MoneyForward プロバイダーのデータを自動取得するスケジューラを内蔵する（`custom` 型は `mise sync` での手動実行）．本番では，08:00 を過ぎてから起動した場合，その日にまだ同期を始めていないプロバイダーを起動時に同期する（失敗した同期も「始めた」に含め，再起動のたびに MF へログインし直さない）．

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
| Linter / Formatter | Biome 2.5 |
| テスト | Vitest 5 |
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
│   │   ├── assets/          # 資産内訳ページ
│   │   ├── income-expense/  # 入出金集計ページ
│   │   ├── transactions/    # 入出金明細ページ
│   │   ├── analysis/        # LLM 資産分析ページ
│   │   └── settings/        # 設定ページ
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

1. `.env.example` から `.env` を生成（既存の `.env` は上書きされない）
2. 依存関係のインストール (`pnpm install`)
3. 実行中コンテナの停止 (`docker compose down --remove-orphans`)
4. PostgreSQL コンテナの起動 (`docker compose up -d db --wait`)
5. マイグレーションの実行 (`prisma migrate dev --name init`)
6. Prisma クライアントの再生成 (`prisma generate`)
7. シードデータの投入 (`prisma db seed`)
8. 1Password から `data/runtime/op-secrets.json` を生成 (`mise run setup:secrets`．`OP_VAULT` 未設定の場合は警告のみで終了)

### 開発サーバーの起動

```bash
mise dev
```

basePath が `/my-assets` のため，ブラウザで `http://localhost:3000/my-assets` にアクセスする．

## アーキテクチャ

### 1. プロバイダー管理 (`Provider` モデル)

外部サービスからのデータ取得は「プロバイダー」という単位で管理される．

| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| `name` | String | プロバイダー名（一意）．MF の場合は 1Password のアイテム名． |
| `type` | String | `"mf"` (MoneyForward) または `"custom"`． |
| `scraperScript` | String? | **(Customのみ)** 実行するスクリプト名（既定: `custom-scraper.ts`）． |
| `isActive` | Boolean | 有効/無効フラグ． |
| `lastSyncAt` | DateTime? | 最終同期の実行時刻． |
| `lastSyncSuccess` | Boolean? | 最終同期の成功/失敗（同期実行中は null）． |

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
| `Provider` | 外部サービス連携の単位（mf / custom） |
| `MainAccount` | 金融機関ごとの親口座 |
| `SubAccount` | 普通預金，証券，ポイント等，金額を持つ最小単位 |
| `Transaction` | 入出金明細．振替ペア管理に対応 |
| `BalanceHistory` | 日ごとの残高履歴スナップショット（グラフ用） |
| `Holding` | 投資信託などの保有銘柄（現在値） |
| `HoldingHistory` | 保有銘柄の日次スナップショット |
| `CryptoAsset` | 暗号資産の保有情報 |
| `PointDetail` | ポイントの有効期限別内訳 |
| `MainCategory` | 収支カテゴリ（収入/支出） |
| `SubCategoryItem` | サブカテゴリ |
| `CategoryRule` | カテゴリ自動分類のためのキーワードルール |
| `TransferRule` | 振替自動認識のキーワードルール |
| `CreditCardBilling` | クレジットカードの請求データ |
| `AssetAnalysis` | LLM 資産分析の結果 |

## デプロイ (GitHub Actions)

`main` への push により，`.github/workflows/ci-cd.yml` が自動実行される（PR には `ci-checks`（biome / tsc / vitest / `next build`）と，push しない amd64 の Docker ビルド確認 `docker-build-check` が実行される）．

### デプロイフロー

1. **Build**: Docker イメージをビルドし，GitHub Container Registry (GHCR) へ push する．
2. **Deploy**: Tailscale 経由でデプロイ先ホストへ接続し，compose ファイルを転送する．
3. **Secrets Extraction**: ホスト側の `op` CLI を使用し，`OP_SERVICE_ACCOUNT_TOKEN` を用いて認証情報を抽出．`data/runtime/op-secrets.json` を生成する．
4. **Backup**: マイグレーションの前に `pg_dump` で DB をダンプし，デプロイ先の `data/backups/` に保存する（デプロイで取ったものは新しい 10 件を残す）．
5. **Migrate**: `docker compose run --rm app prisma migrate deploy` でマイグレーションを適用する．
6. **Update**: `docker compose up -d --force-recreate --remove-orphans` を実行して反映する．

### 必要な環境変数・Secrets

#### GitHub Secrets
- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PORT`, `DEPLOY_TARGET`
- `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`: Tailscale 経由のホスト接続用

#### デプロイ先 `.env`
- `POSTGRES_PASSWORD`: DB パスワード（必須）．app の `DATABASE_URL` は compose が `POSTGRES_*` から組み立てるので，`.env` に `DATABASE_URL` は要らない
- `OP_SERVICE_ACCOUNT_TOKEN`: 1Password サービスアカウントトークン
- `OP_VAULT`: 1Password のボルト名
- `OP_MF_ITEM_ID`: MF 用の 1Password アイテム名（既定: `MF_Main`）

### DB のバックアップと復元

データはデプロイ先の named volume `postgres_data` にしかない．デプロイのたびに，マイグレーションの前のダンプを `data/backups/my-assets-deploy-<日時>-<commit>.dump`（`pg_dump -Fc` の形式）に保存する．ダンプには取引の摘要と金額が入るので，ディレクトリは 0700，ファイルは 0600 にしている．

デプロイの間が空くとダンプも古くなるので，デプロイ先の crontab に次の行を足して毎日も取る．曜日ごとのファイルを上書きするので，7 件まで残る．`<DEPLOY_TARGET>` はデプロイ先のディレクトリに置き換える．

```sh
15 4 * * * cd <DEPLOY_TARGET> && umask 077 && docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > data/backups/my-assets-daily.dump.tmp && mv data/backups/my-assets-daily.dump.tmp "data/backups/my-assets-daily-$(date +\%a).dump"
```

復元するときは，app を止めてから `pg_restore --clean --if-exists --create` でダンプを戻す．`--clean` だけではダンプにあるオブジェクトしか消さないので，ダンプの後のマイグレーションが足したテーブルが残る．`--create` を付けて DB ごと作り直す．作り直す DB には接続できないので，`-d` には `postgres` を指定する．

```sh
docker compose stop app
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --create -U "$POSTGRES_USER" -d postgres' < data/backups/<ファイル名>.dump
docker compose start app
```

app の起動時には，`Dockerfile` の `CMD` が `prisma migrate deploy` を実行する．失敗したマイグレーションを戻すために復元したときは，同じイメージで起動すると同じマイグレーションがもう一度適用される．`docker compose start app` の代わりに，前の commit のイメージ（`IMAGE_TAG=<前の commit SHA> docker compose up -d app`）で起動する．

### 本番の前段（Cloudflare と Basic 認証）

本番は Cloudflare を経由して公開し，アプリより手前で Basic 認証をかけている．

- **認証**: アプリ自体には認証がない．前段の Basic 認証を外すと，誰でもページを見られ，Server Actions から同期の実行や設定の変更ができる．
- **CSP**: Cloudflare の Rocket Loader は，nonce の付かない自身のスクリプトを HTML に差し込む．そのため `src/proxy.ts` の `script-src` は nonce を使わず，`'self' 'unsafe-inline' ajax.cloudflare.com` にしている．Cloudflare で Rocket Loader を止めた場合は，nonce 方式（`4f8f4c8`）に戻せる．

## ライセンス

MIT License
