# リポジトリ監査結果（2026-09-16）

リポジトリ全体（設定・スキーマ・ワークフロー・全ソース）を再確認した結果と，
実施した修正，未決の提案をまとめる．

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
- **`TransferRule.priority` の schema / migration 不一致**：未コミットの migration `20260915142627_init`（列削除）が既に用意されており，コミットすれば整合する．
- **秘密情報のコミット**：`.gitignore` が `.env` と任意深さの `op-secrets.json` を除外しており，トラッキング履歴に秘密ファイルは無い．
- **seed の冪等性**：既存データチェックにより再実行で重複しない．
- **Dockerfile / standalone 整合**：`output: "standalone"` と runner の構成が整合し，`prisma migrate deploy` / seed 実行に必要なツールがイメージに含まれる．

## 未決の提案（ユーザー判断待ち）

| ID | 内容 | 選択肢 |
| :--- | :--- | :--- |
| P1 | 未使用のチャートコンポーネントが 3 つ存在（`DashboardDonutChart` ×2：`dashboard-charts.tsx` と `dashboard-donut-chart.tsx`，`DonutChart`：`charts/donut-chart.tsx`．いずれも import 元なし） | A1: 削除 (Recommended) / A2: 保持 |
| P2 | `MF_FULL_SYNC` 環境変数は `src/scripts/sync.ts` で設定されるが読み込まれておらず，CLI 同期は常に scheduled（増分）モードで実行される | A1: エントリポイントで変数を尊重して manual（全量バックフィル）モードに切替 / A2: `sync.ts` 側の変数設定を削除 (Recommended) |
| P3 | `getProviders` / `createProvider` が `actions/accounts.ts` と `actions/providers.ts` に重複定義され，挙動（並び順・scraperScript 処理）が異なる | A1: 片方に集約 / A2: 現状維持 |
| P4 | `buildTransferPairs`（mf-scraper.ts）は同日・同額（±amount）の任意の 2 明細を振替ペアとしてマークするため，実際には無関係な収入＋支出のペアが明細一覧から隠れる可能性がある | A1: ペアリング条件の強化（説明テキストの一致等を追加）/ A2: 現状維持（運用上許容） |
| P5 | 固定の開始日付が複数箇所にある（入出金推移・年別集計のクエリが `2024-01-01` 起点，`MonthNavigator` と設定画面の同期ダイアログが `2023` 起点） | A1: 定数化・統一 / A2: 意図的なデータ起点として現状維持 |
| P6 | `.env.example` の `NEXT_PUBLIC_APP_URL`（basePath 未含み）と `APP_IMAGE` / `IMAGE_TAG` がコード・CI から参照されていない | A1: 削除 / A2: 使用箇所を追加 |
| P7 | 非推奨・レガシーの残骸（`settings-content.tsx` のローカル `formatDateTime`（`formatJSTDateTime` 推奨），`analysis/page.tsx` の `NextPage` 型と `onPointerDown`，空ディレクトリ `src/contexts/`・`src/hooks/`） | A1: 清理 / A2: 現状維持 |
| P8 | 未コミットの migration `20260915142627_init`（`TransferRule.priority` 削除）をコミットする | A1: コミット (Recommended) / A2: 保持 |

## 検証コマンド

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check
pnpm build       # next build（警告 0 件）
```
