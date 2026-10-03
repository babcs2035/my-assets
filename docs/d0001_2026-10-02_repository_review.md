# リポジトリ再レビュー（2026-10-02）

`93b8c05` 時点のリポジトリ全体をあらためて調べた結果をまとめる．
調査は 2026-10-02 に打ち切った．未調査の領域と，未対応の項目は「調査の範囲と状況」と「未解決の事項」に記す．
重大度は High，Medium，Low の 3 段階で付ける．

## 調査の範囲と状況

| 領域 | 状況 |
| :--- | :--- |
| インフラ，セキュリティ（proxy，CI/CD，Docker，秘密情報，設定） | 調査済み（本ファイルの「インフラとセキュリティ」） |
| Server Actions（`src/actions/`，`src/lib/`） | 未調査 |
| スクレイパー，同期処理（`src/scraper/`，`src/lib/scheduler.ts` など） | 未調査 |
| UI（`src/app/`，`src/components/`） | 一部調査済み（固定パス，Tremor，日付表示）．残りは未調査 |

補足: 本ファイルの ID が付いた項目のうち，「対応」の記述がないものは直していない．対応の予定も立てていない．

## インフラとセキュリティ

### INF-1（High）: proxy が一度も実行されていない

- **対象**: `src/proxy.ts:56-58`
- **事実**: `matcher: "/my-assets/:path*"` と指定しているが，Next.js は `basePath` を matcher の先頭に自動で付ける．
  ビルドで生成される `.next/server/functions-config-manifest.json` の正規表現は `^\/my-assets(...)?\/my-assets(...)` になっており，対象は `/my-assets/my-assets/...` だけである．
- **確認方法**: `next start -p 3401` で起動し，`/my-assets`，`/my-assets/settings`，`/my-assets/icon.svg` の応答ヘッダーを `curl -D -` で見た．
  どの応答にも `Content-Security-Policy`，`X-Frame-Options`，`Access-Control-*` が付いていなかった．
- **影響**: CSP，`X-Frame-Options: DENY`（クリックジャッキング対策），`nosniff` などのヘッダーがすべて効いていない．
- **直すときの注意**: matcher だけを直すと，今度は CSP の `script-src 'self' 'strict-dynamic'` が効き始める．
  HTML の `<script>` には nonce が付いていないため，`'strict-dynamic'` によって `'self'` が無視され，すべてのスクリプトが止まって画面が動かなくなる．
  matcher の修正（`basePath` を除いた形にし，`_next/static` などの静的ファイルを除外する）と，CSP の修正は同じ commit で行う必要がある．
  CSP の直し方は次の 2 つから選ぶ．
  - nonce を使う（`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` の方式）．全ページが動的レンダリングになる．
  - `script-src 'self' 'unsafe-inline'` に緩める．静的レンダリングは保てるが，インラインスクリプトの注入は防げない．
- **対応**: `18bed25` で matcher を直し，CSP をいったん `'unsafe-inline'` に緩めた．その後 `4f8f4c8` で nonce 方式に移した．
  8 ページのうち 7 ページはもともと `force-dynamic` だったので，動的レンダリングに変わったのは `/analysis` と `/_not-found` だけである．
- **あわせて直す点**: 同じオリジンから呼ぶ Server Actions には CORS ヘッダーは要らない．`Access-Control-Allow-Credentials: true` を全応答に付ける処理は削除してよい．
  `X-XSS-Protection` は現在のブラウザでは使われていないので，削除するか `0` にする．

### SEC-1（High，要確認）: アプリに認証がない

- **対象**: `src/actions/*.ts`（`"use server"` のファイル 9 つ），`next.config.ts`
- **事実**: Basic 認証は `e78d4e8` で削除され，ほかの認証の仕組みもない．`"use server"` のファイルから export された関数は，すべて外から呼べる POST の入口になる．
  `next.config.ts` の `serverActions.allowedOrigins` に `ktak.dev` が入っている．
- **影響**: アプリに届く経路があれば，誰でも資産データの閲覧，口座やカテゴリの削除，同期の開始ができる．同期を始めると，1Password から取った認証情報で MoneyForward にログインする．
- **未確認の点**: 本番が `127.0.0.1` に公開したポートの前に認証付きのリバースプロキシ（Tailscale，Cloudflare Access など）を置いているかどうかは，リポジトリからは分からない．
  置いていない場合は High のまま，置いている場合でも，その前提を README に書いておくべきである．

### SEC-2（Medium）: MoneyForward の認証情報を入れたファイルを誰でも読める

- **対象**: `.github/workflows/ci-cd.yml:237`（`os.chmod(..., 0o644)`），`scripts/generate-op-secrets.sh`
- **事実**: `op-secrets.json` にはパスワードと TOTP の secret が入っている．デプロイ先では `0o644` で作られる．ローカルの `data/runtime/op-secrets.json` も 644 になっている．
  `generate-op-secrets.sh` は `/tmp/op-secrets-tmp.json` と `/tmp/op-secrets-item-tmp.json` を，umask を指定せずに作っている．そのため一時的に `/tmp` に誰でも読めるファイルができる．
- **直し方**: コンテナの `nextjs`（uid 1001）が読めればよいので，ファイルの所有者を 1001 にして `0o600` にする．
  一時ファイルは `umask 077` と `mktemp` で作り，`trap` を使って終了時に消す．

### SEC-3（Low）: リポジトリ直下に古い `op-secrets.json` が残っている

- **対象**: `/op-secrets.json`（2026-09-15 作成，644）
- **事実**: `.gitignore` で除外されていて，commit はされていない．中身は `data/runtime/op-secrets.json` と同じである．
  `generate-op-secrets.sh` の出力先が `data/runtime/` に変わった（CFG-2）あとの残りで，どこからも読まれていない．
- **直し方**: 削除する．認証情報が入っているので，ユーザーが確認してから消す．

### SEC-4（Medium）: `generate-op-secrets.sh` が `.env` を正しく読めない場合がある

- **対象**: `scripts/generate-op-secrets.sh:5`
- **事実**: `export $(grep -v '^#' .env | xargs)` は，値に空白や引用符が入っていると壊れる．`set -a; . ./.env; set +a` に置き換える．

### CI-1（High）: GitHub Actions を `@main` や `@master` で参照している

- **対象**: `.github/workflows/ci-cd.yml` の `uses:` 11 か所
- **事実**: `appleboy/ssh-action@master` と `appleboy/scp-action@master` にはデプロイ用の SSH 鍵が，`tailscale/github-action@main` には OAuth secret が，`docker/login-action@master` には `GITHUB_TOKEN` が渡っている．
  参照先のリポジトリに push されたものが，次の実行でそのまま使われる．
- **直し方**: 各 action をリリースの commit SHA で固定する（例: `uses: actions/checkout@<sha> # v5.x.y`）．あわせて Dependabot か Renovate で更新を管理する．

### CI-2（Medium）: イメージの pull に失敗しても，デプロイが成功したように見える

- **対象**: `.github/workflows/ci-cd.yml:241`
- **事実**: `docker compose pull --quiet || true` は失敗を握りつぶす．GHCR への認証が切れていても，古いイメージのまま再起動し，ジョブは成功で終わる．
- **あわせて**: `set -euo pipefail` の下では，`docker compose run ... prisma migrate deploy` が失敗するとその時点でスクリプトが終了する．そのため，直後の `MIGRATE_EXIT` の確認には到達しない（動作は安全側だが，コードとしては死んでいる）．

### OPS-1（Medium）: DB のバックアップがない

- **事実**: README，compose，workflow のどこにも `pg_dump` やバックアップの手順がない．データは named volume の `postgres_data` にしかない．
  スクレイピングで取れるのは MoneyForward 側に残っている期間だけなので，volume を失うと過去の履歴（`BalanceHistory`，`HoldingHistory`）は戻せない．
- **直し方**: デプロイ先のホストで，`pg_dump` を定期的に実行して volume の外に保存する．migrate deploy の前にもダンプを取る．

### DOCK-1（Medium）: runner ステージの Playwright がバージョン固定されていない

- **対象**: `Dockerfile:55`（`pnpm dlx playwright install-deps chromium`）
- **事実**: `pnpm dlx` は lockfile を見ずに，その時点の最新の `playwright` を取得する．このため次の 2 つが起きる．
  - build ステージでブラウザを入れる `playwright@1.63`（lockfile）と，OS 依存パッケージを入れる版が一致する保証がない．
  - `minimumReleaseAge` と trust policy も効かない．
- **直し方**: `pnpm dlx playwright@<lockfile と同じ版>` とするか，build ステージと同じ `pnpm exec` を使う．

### DOCK-2（Low）: イメージが約 5 GB ある

- **事実**: `docker build` で作ったイメージは 4,996,246,093 バイトだった．standalone の出力に加えて `node_modules` を丸ごと runner にコピーしている（`Dockerfile:73`）．
  コメントによると，`prisma.config.ts` が `prisma/config` を読むために必要とされている．
- **直し方**: `prisma` と `prisma/config` に必要なパッケージだけを残す．または migrate 専用のイメージ（ステージ）を分ける．

### DOCK-3（Low）: arm64 のイメージを確認していない

- **事実**: CI は `linux/arm64,linux/amd64` でビルドしているが，2026-10-02 に起動まで確かめたのは x86_64 だけである．

### LINT-1（Low）: `src/` の外が Biome の検査対象になっていない

- **事実**: CI と `pnpm lint` は `./src` しか検査しない．`pnpm biome ci .` を実行すると，次の理由で失敗する．
  - `biome.json` の `$schema` が 2.3.15 のままで，インストールされている Biome 2.5.7 と合わない．また，非推奨のキーがある（`biome.json:27`）．
  - `vcs.useIgnoreFile` が `false` なので，`.next/` の生成ファイルまで検査される．
- **影響**: `vitest.config.mts`，`prisma/seed.ts`，`prisma.config.ts`，`scripts/db-check.ts` が lint されていない．
- **直し方**: `biome migrate` で設定を更新し，`vcs.useIgnoreFile: true` にする．そのうえで，CI と `pnpm lint` の対象をリポジトリ全体にする．

### 問題なしと確認した項目

- `pnpm audit --prod`: 既知の脆弱性は 0 件だった．
- 秘密情報の commit: `op-secrets.json`，`.env`，`/data/` は `.gitignore` で除外されており，git の管理下に入っていない．
- ログへの秘密情報の出力: `src/lib/onepassword.ts` は TOTP の桁数や周期などの情報しかログに出さない．CI の 1Password 抽出スクリプトも，フィールドのラベルと型だけを出力する．
- 外部コマンドの実行: `execFileSync`（`src/lib/onepassword.ts`，`src/scripts/sync.ts`）は引数を配列で渡しており，shell を経由しない．
- API Route（`route.ts`）はない．外から呼べる入口は，ページと Server Actions だけである．

## UI

### UI-1（Medium）: `@tremor/react` が使われていない

- **対象**: `package.json:39`，`README.md:24`
- **事実**: `src/`，CSS，設定ファイルのどこにも `@tremor/react` の import や参照がない（`node_modules`，`.next`，lockfile を除いて `grep -rn -i tremor` で確認）．
  `pnpm why recharts` によると，deprecated 警告の出ている `recharts@2.15.4` は `@tremor/react@3.18.7` が引き込んでいる．アプリ本体が使っているのは `recharts@3.10.1` である．
- **影響**: `pnpm peers check` の警告（Tremor が React `^18` を要求する，以前の S3），`recharts@2` の deprecated 警告，使っていない依存の分の install 時間とイメージサイズ．
- **直し方**: `pnpm remove @tremor/react` を実行し，README の技術スタックから Tremor を消す．そのあと `pnpm peers check` で警告がなくなったこと，`pnpm build` が通ることを確かめる．

### 問題なしと確認した項目（UI）

- `src/app/layout.tsx:27-39` の `/my-assets/manifest.json` と `/my-assets/icon.svg`: Next.js の metadata は icon や manifest のパスに `basePath` を自動で付けないので，直接書く必要がある．
- `Link href="/"` や `href="/accounts"`（`not-found.tsx:30`，`account-detail-page-content.tsx:91,230`，`new-account-form.tsx:60`）: `next/link` が `basePath` を自動で付けるので正しい．
- `toLocaleString()` の呼び出しは数値の桁区切りだけで，日付には使っていない．`calendar-grid.tsx:80,84` の `getDate()` は，年と月から作った日付の日数を求めているだけなので，TZ の影響を受けない．

## 対応済みの記録（2026-10-02）

未 push の commit のレビューで見つけた問題は，次の commit で直した．

| ID | 内容 | commit |
| :--- | :--- | :--- |
| S2 | Prisma の client，adapter，CLI を `~7.9.1` にそろえた | `2af1621` |
| P1-b | `ignoredBuiltDependencies` から `sharp` を外した | `5de8a38` |
| S1 | `getExpiringPoints` が `expirationDate` を ISO 文字列で返すようにした | `91d4806` |
| D1 | Dockerfile の `tsx` を lockfile と同じ `4.23.15` にした | `662f15c` |
| P4 | Vitest を導入し，sidebar の判定ロジックに回帰テストを付けた | `93b8c05` |
| C2 | CSP の `script-src` をリクエストごとの nonce と `'strict-dynamic'` にし，root layout で全ページを動的レンダリングにした | `4f8f4c8` |

## 未解決の事項

### DATA-1（未分類）: 残高の推移と取引明細の合計が合わない口座がある

2026-10-02 にローカル DB で MoneyForward から再同期したあと，SQL で確かめた結果である．原因は特定していない．本番の DB で同じことが起きているかも確かめていない．

- **残高の増減と明細の合計の差**: 残高履歴の最初の日の翌日から最後の日までについて，明細の金額の合計と残高の増減を比べた．
  - `代表口座 - 円普通`（2023-02-19〜2026-10-02）: 残高の増減は 1,118,991 円，明細の合計は 1,286,346 円で，167,355 円ずれている．明細のうち 174,830 円は，振替ルールで作られた行である．
  - `残高別普通`（2024-05-29〜2026-10-02）: 残高の増減は -22,178 円，明細の合計は +197,703 円である．
  - `SBIハイブリッド預金`，`Suica`，`普通預金` では，両者が一致した．
- **`残高別普通` の残高が 0 円になっている**: 2026-09-28 に 174,290 円から 0 円になった．同じ日の `代表口座 - 円普通` の増加は 2,368 円だけなので，口座間の移動とは数字が合わない．
- **負債の口座で残高がプラスになっている期間がある**: 表示対象の `Amazon`（2023-01-12〜2026-09-30），`Amazonマスター`（2023-12-07〜2024-03-10），`PayPayカード`（2025-08-27〜2025-09-03）で起きている．
  表示対象の負債の口座のプラス残高の合計は，2023-06-01 に 156,497 円，2024-01-01 に 343,913 円だった．純資産の推移は，この分だけ多く表示されている可能性がある．
- **原因の候補（未確認）**: `generateTransactionId`（`src/lib/hash.ts`）は，サブ口座，日付，金額，摘要から取引の ID を作る．そのため，同じ日に同じ金額と摘要の取引が複数あると，1 行にまとまる．
  MoneyForward の API が返す取引の `id`（`user_asset_act.id`）を照合のキーに使えば，この重なりは起きなくなる．
- **2026-10-03 時点の扱い**: スキーマを変えずに既知の問題として残す．`hash.ts` と `mf-scraper.ts` の upsert のコメントに，この問題を明記した．
  - upsert の update 節は，ID が同じ値から作られるので，`isTransfer` 以外は何も補正しない．MoneyForward 側で日付や金額が修正された取引は，別 ID の新しい行として増え，古い行は残る．これも明細の合計がずれる原因の候補である．
  - 同じ日に同じ店で同じ金額を 2 回払うと 1 行にまとまる．
  - 直すには，`Transaction` に MoneyForward の act id の列を追加し，既存の行との突き合わせ（移行手順）を決める必要がある．

### DEPLOY-1: push 後の CI/CD とデプロイを確かめていない

`18bed25`（セキュリティヘッダー），`4f8f4c8`（CSP の nonce 方式），`9fce99b`（同期を DB でロックする）について，本番での動作を確かめていない．
確かめる場合は，次の 2 点を見る．

- 各ページで，ブラウザのコンソールに CSP 違反が出ていないこと．
- 同期を同時に 2 つ始めたとき，後から始めた方が弾かれ，終わったあとにロックが外れること．

## 調べてわかったこと

- **proxy の matcher には `basePath` が自動で付く**: `basePath` を設定しているときは，matcher に `basePath` を含めない．ビルドが実際にどう解釈したかは `.next/server/functions-config-manifest.json` の `matchers[].regexp` で確かめられる．
- **`'strict-dynamic'` には nonce か hash が要る**: `'strict-dynamic'` があると，`'self'` などのホストによる許可は無視される．nonce なしで指定すると，すべてのスクリプトが止まる．
- **`vite` の `minimumReleaseAge`**: `vite@8.3.2`（2026-10-01T10:17Z 公開）は，2026-10-02 の作業時点で 24 時間経っていなかった．`^8.3.1` と幅を持たせて指定すると，pnpm は期間の条件を満たす最新版を選ぶ．
- **nonce はリクエストの CSP ヘッダーから読まれる**: Next.js は描画時に，応答ではなくリクエストの `Content-Security-Policy` から nonce を取り出す．そのため proxy では，`NextResponse.next({ request: { headers } })` を使ってリクエストにも同じ CSP を付ける．
- **`style-src` には nonce を使わない**: Radix UI と recharts は `style` 属性を，`chart.tsx` は `<style>` 要素を出力する．nonce は `style` 属性には効かない．また，nonce を書くとブラウザは `'unsafe-inline'` を無視するので，表示が崩れる．
- **CSP の確認手順**: production build を `next start` で起動し，HTML の `<script>` すべてにヘッダーと同じ nonce が付いていることを確かめる．さらに Playwright で `securitypolicyviolation` event を記録しながら，ページを開く場合と，リンクでクライアント側の遷移をする場合の両方を確かめる．
- **zsh には `PIPESTATUS` がない**: `cmd | tail` のあとの `$?` は `tail` の終了コードになる．コマンドの成否は，パイプを通さずに実行して確かめる．
- **Docker での確認手順**: 開発用の DB を汚さないために，専用のネットワークと，ポートを公開しない使い捨ての `postgres:16-alpine` を使う．イメージには `verify` タグを付ける．
  この手順で `prisma migrate deploy`（18 件），`tsx prisma/seed.ts`，`CMD` による起動（200 応答）を確かめた．

## 検証コマンド

```bash
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
pnpm biome ci ./src
pnpm build       # prisma generate && next build
```
