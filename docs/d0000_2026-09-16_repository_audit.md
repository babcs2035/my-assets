# リポジトリ監査結果（2026-09-16）

リポジトリ全体（設定・スキーマ・ワークフロー・全ソース）を再確認した結果と，
実施した修正，提案の解決状況をまとめる．

## 実施済みの修正（2026-09-16 のコミット群）

| ID | 内容 | 対象 |
| :--- | :--- | :--- |
| SEC-1 | OTP コードと TOTP secret のログ出力を除去（本番ログレベルは info のため機密がログに残る） | `src/lib/onepassword.ts`, `src/scraper/mf-scraper.ts` |
| SEC-2 | seed の `DATABASE_URL` ログをパスワードマスク化（ログ行自体は保持） | `prisma/seed.ts` |
| CORR-1 | `importCategories` が `SubCategoryItem` 削除前に `Transaction.subCategoryId` を null 化していなかったため FK 制約違反（Restrict）で失敗し得た問題を修正 | `src/actions/categories.ts` |
| CORR-2 | サーバーローカル TZ 依存の日付キーを JST ヘルパー（`formatJSTDate` 等）に統一（ダッシュボードの期間比較，クレカ請求フィルタ，カレンダーの今日判定，請求クエリ境界） | `src/app/page.tsx`, `src/actions/accounts.ts`, `src/components/accounts/account-list.tsx`, `src/components/transactions/calendar-grid.tsx` |
| CORR-3 | `runMfScraper` がプロセス内呼び出し（スケジューラ / Server Action）でも共有 Prisma クライアントを `$disconnect` していた問題を修正（エントリポイント実行時のみ切断） | `src/scraper/mf-scraper.ts` |
| BUILD-1 | 環境変数由来の secrets パスに対する Turbopack のプロジェクト全体 tracing 警告を `turbopackIgnore` で抑制（`existsSync` と `readFileSync` の両方） | `src/lib/onepassword.ts` |
| CFG-1 | 開発用 compose の `DATABASE_URL` を db サービスと同じ環境変数から組み立てるように修正（`.env.example` 由来のパスワードで認証失敗する問題） | `docker-compose.yml` |
| CFG-2 | `generate-op-secrets.sh` の出力先を compose がマウントする `data/runtime/op-secrets.json` に統一 | `scripts/generate-op-secrets.sh` |
| DOC-1 | README を実態に整合（ワークフロー名 `ci-cd.yml`，basePath 付き URL，Tailscale Secrets，`DATABASE_URL`，setup 手順 8 ステップ，`api/sync/` の削除，モデル表の補完，migrate deploy ステップ，スケジューラ対象の明記，Biome 2.5） | `README.md` |
| DOC-2 | `unstable_cache` を使わない action からの誤った「Cached exports (TTL: 5分)」注記を除去（実際にキャッシュするのは `dashboard.ts` のみ） | `src/actions/assets.ts`, `src/actions/income-expense.ts` |
| HYG-1 | `.gitignore` に `/data/` を追加 | `.gitignore` |

## 検証の結果，問題なしと確認した項目

- **migration チェーンは新規 DB で適用可能**：`HoldingHistory` は `20260528004929_init` で作成され，`20260528094025_add_holding_history` で修正される（順序は正しい）．`20260514020312_init` はインデックス作成のみ．
- **`TransferRule.priority` の schema / migration 不一致**：migration `20260915142627_init`（列削除）をコミット済み（`bee7f60`）．
- **秘密情報のコミット**：`.gitignore` が `.env` と任意深さの `op-secrets.json` を除外しており，トラッキング履歴に秘密ファイルは無い．
- **seed の冪等性**：既存データチェックにより再実行で重複しない．
- **Dockerfile / standalone 整合**：`output: "standalone"` と runner の構成が整合し，`prisma migrate deploy` / seed 実行に必要なツールがイメージに含まれる．

## 解決済みの提案（2026-09-16 に実施）

| ID | 実施内容 | コミット |
| :--- | :--- | :--- |
| P1 | 未使用のチャートコンポーネントを削除（`DashboardDonutChart` ×2，`DonutChart`．不要になった recharts import と `formatCurrency` import も除去） | `6c5b06d` |
| P2 | `sync.ts` の `MF_FULL_SYNC` 設定を削除（読み込み箇所が存在せず，常に既定モードで実行されていた） | `ddb346c` |
| P3 | `actions/accounts.ts` の重複 `getProviders` / `createProvider` を削除（呼び出し元はすべて `actions/providers.ts` 版を使用） | `7102597` |
| P4 | `buildTransferPairs` のペアリング条件に「両明細の desc に『振替』を含む」を追加（同日同額の無関係な収入＋支出ペアの誤ペアリングを防止．ペアリングできない明細は表示され続ける安全側） | `0fb801d` |
| P5 | 固定開始日付を定数化（`BACKFILL_START_DATE = "2023-01-01"` を `lib/utils.ts` に追加し mf-scraper / month-navigator / 設定画面のダイアログに適用．入出金集計の `2024-01-01` は `income-expense.ts` 内のローカル定数 `INCOME_EXPENSE_AGGREGATION_START_DATE` に）．値はすべて不変 | `ae925e6` |
| P6 | `.env.example` の未使用変数を削除（`NEXT_PUBLIC_APP_URL`，`APP_IMAGE`，`IMAGE_TAG`） | `4866d2d` |
| P7 | レガシー残骸を削除（`settings-content.tsx` のローカル `formatDateTime` を `formatJSTDateTime` に置換（表示同一），`analysis/page.tsx` の `NextPage` 型と `onPointerDown` を除去（履歴行は兄弟 `<button>` 2 つに再構成しキーボード操作可能に），空ディレクトリ `src/contexts/`・`src/hooks/` を削除） | `76f7e9b` |
| P8 | 未コミットだった migration `20260915142627_init`（`TransferRule.priority` 削除）をコミット | `bee7f60` |

## 検証コマンド

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check
pnpm build       # next build（警告 0 件）
```
