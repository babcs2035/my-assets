# リポジトリ全体の技術的な問題の調査（2026-10-03）

`562a628` 時点のリポジトリ全体を調べ，技術的な問題点をまとめる．
外部の情報（依存パッケージの脆弱性，最新版，既知の問題）は tavily-search（`tvly search`）と公式ページで確かめた．
重大度は High，Medium，Low の 3 段階で付ける．
前回までの記録（`docs/d0000_2026-09-16_repository_audit.md`，`docs/d0001_2026-10-02_repository_review.md`）にある項目は，再掲せず ID だけを参照する．

## 調査の範囲と状況

| 領域 | 状況 |
| :--- | :--- |
| 依存パッケージ（脆弱性，最新版） | 調査済み（本ファイルの「依存パッケージ」） |
| インフラ（Dockerfile，compose，CI/CD） | 調査済み（本ファイルの「インフラ」） |
| Server Actions，`src/lib/`，スキーマ | 調査済み（本ファイルの「Server Actions と `src/lib/`」．`system.ts` を含む） |
| スクレイパー，同期処理 | 調査済み（本ファイルの「スクレイパーと同期処理」） |
| UI（`src/app/`，`src/components/`） | 調査済み（本ファイルの「UI」） |

## 依存パッケージ

2026-10-03 時点でインストールされている版: `next@16.3.8`（npm の `latest` と同じ），`react@19.2.7`，Next.js が同梱する React は `19.3.0-canary-cbb046ab-20260731`，`@prisma/client@7.9.1`，`playwright@1.63.0`，Node.js `24.19.0`．

### DEP-1（要監視）: Next.js の Critical 1 件と High 1 件が，最新版でも直っていない

- **事実**: 2026-09-30 の September 2026 Security Release は，当初 9 件（Critical 1，High 2）を直す予定だった．実際に `16.3.8` で直ったのは 7 件で，残りの Critical 1 件と High 1 件は「上流の依存との調整待ち」として後の版に延期された．
  延期された 2 件の対象範囲や前提条件（Server Actions，RSC，proxy など）は公表されていない．
- **影響**: このアプリが影響を受けるかどうかは，現時点では判断できない．アプリに認証がない（`docs/d0001` の SEC-1）ため，Server Actions や RSC が対象だった場合は影響が大きい．
- **対応**: Next.js の告知（blog と GitHub Security Advisories）を追い，修正版が出たらすぐに上げる．
- **出典**: Next.js blog「September 2026 Security Release」「Upcoming Next.js September Security Release」

### 影響を受けないと確認した告知

- **July 2026 Security Release**（CVE-2026-64641 ほか 8 件）: 修正は `16.2.11` と `16.3.0` 以降に入っている．`16.3.8` は対象外．
- **September 2026 Security Release の 7 件**: すべて `16.3.8` で修正済み．なお，High の CVE-2026-94483（画像最適化の SSRF）は `images.remotePatterns` を設定していなければ影響しない．`next.config.ts` には設定がない．
- **React 19.2.8**（2026-07-21）: リリースノートにある変更は RSC のデコードの性能改善だけで，CVE は載っていない．App Router は Next.js が同梱する React を使うので，`package.json` の `react` の版は RSC の実行には使われない．

### DEP-2（Low）: Node.js が `24.19.0` に固定されている

- **対象**: `mise.toml:2`，`Dockerfile:6`
- **事実**: 24.x の最新は `24.21.0`（2026-09-08）．`24.20.0`（2026-08-26）と `24.21.0` は CVE が付いたセキュリティリリースではないが，次の修正を含む．
  - use-after-free の修正（http2 の `rst_stream`，sqlite，quic）
  - 範囲外書き込みの修正（`fs.mkdtemp`，ucs2 の変換）
  - OpenSSL 3.5.8，Undici 7.29.1，ルート証明書（NSS 3.126）への更新
- **補足**: Node.js 24 の Active LTS は 2026 年 10 月下旬に終わり，Maintenance LTS に移る（endoflife.date）．
- **対応**: `mise.toml` と `Dockerfile` を同時に `24.21.0` へ上げる．
- **結果**: `4a44bd8`．`24.21.0` で typecheck，vitest（7 件），`next build` が通り，静的と動的のルートも変わらないことを確かめた．

### DEP-3（Low）: dev 依存の `braces@3.0.3` に High の脆弱性がある

- **事実**: `pnpm audit` で GHSA-vfj7-8cjw-p6xm（深くネストした括弧のパターンでスタックを使い果たす DoS，修正は `>=3.0.4`）が 1 件出る．
  経路は `shadcn > fast-glob > micromatch > braces` だけで，dev 依存である．
- **影響**: アプリの実行時には使わないので，外から攻撃される経路はない．ただし，runner イメージは `node_modules` を丸ごとコピーしている（`docs/d0001` の DOCK-2）ので，イメージには入っている．
- **対応**: `pnpm-workspace.yaml` の `overrides` に `braces: "^3.0.4"` を足す．`brace-expansion` には既に override がある．
- **結果（未対応，修正版がない）**: 2026-10-03 時点で，GitHub Advisory の `first_patched_version` は `None` で，npm の最新は `3.0.3`（2024-05-21）である．`>=3.0.4` は公開されていないので，override では直せない．
  - 経路は `shadcn > fast-glob > micromatch > braces` と `shadcn > ts-morph > @ts-morph/common > fast-glob > ...` の 2 つで，どちらも dev 依存である．`shadcn@4.21.1` も `fast-glob@^3.3.3` に依存している．
  - 修正版が出たら override を足す．`pnpm audit` で再確認する．
- **結果（対応済み）**: `997da07` で `shadcn` を devDependencies から外した．braces への経路はこれだけだった．
  - `shadcn` は UI 部品を追加する CLI で，CSS の import，スクリプト，`mise` のタスク，`Dockerfile` のどれからも使っていない．部品を足すときは `pnpm dlx shadcn@4 add <name>` で実行する．
  - 外した後，`pnpm audit` は「No known vulnerabilities found」になり，lockfile から 240 パッケージが減った．lint，tsc，vitest（47 件）は通った．
  - `pnpm peers check` の警告（`@tremor/react@3.18.7` が react `^18` を求める）は，外す前と出力が一致しており，今回の変更で増えたものではない．

### DEP-4（Low）: 更新が出ている依存

`pnpm outdated` の結果（2026-10-03）．どれも範囲指定（`~` や固定）によって自動では上がらない．

| パッケージ | 現在 | 最新 | 備考 |
| :--- | :--- | :--- | :--- |
| `@prisma/client`，`@prisma/adapter-pg`，`prisma` | 7.9.1 | 7.10.0 | 2026-08-25 公開．`prisma` の `latest` タグは `8.0.0-rc.19` を指しているので，上げるときは `7.10.0` と版を明示する．`Dockerfile:64` の `prisma@7.9.1` も合わせる |
| `react`，`react-dom` | 19.2.7 | 19.3.0 | App Router の実行には同梱版が使われる |
| `@biomejs/biome` | 2.5.7 | 2.5.15 | |
| `dotenv` | 17.4.2 | 18.0.5 | メジャー更新 |

**結果**:

- `125b1ac` で `react` と `react-dom` を 19.3.0 にした．changelog に breaking change はない．
- `@biomejs/biome` 2.5.15，`@types/node` 26.6.4，`shadcn` 4.21.1，`vite` 8.3.2，`dotenv` 18.0.5 を `f786e23` で上げた．
  - `dotenv@18` は preload（`-r dotenv/config`）と `.env.vault` を削除したが，このリポジトリでは使っていない．`dotenv/config` は残っており，依存パッケージもない．
  - Biome 2.5.15 で format と lint を実行し，変更がないことを確かめた．
  - lockfile に新しく入ったのは，`shadcn@4.21.1` が持ち込む `@shadcn/registry@0.1.0` と `type-fest@4.41.0` だけである．
- **Prisma は 7.9.1 のまま（未対応）**: `pnpm add -D prisma@~7.10.0` が `ERR_PNPM_TRUST_DOWNGRADE` で止まった（`pnpm-workspace.yaml` の `trustPolicy: no-downgrade`）．
  - `prisma@7.10.0` は `prismabot <bot-npm@prisma.io>` が provenance なしで公開している．`prisma@7.9.1`，`@prisma/client@7.10.0`，`@prisma/adapter-pg@7.10.0`，`prisma@8.0.0-rc.19` は GitHub Actions の OIDC から provenance 付きで公開されている．
  - CLI だけ trust の証拠が消えているので，サプライチェーンの事故の可能性を否定できない．ポリシーは外さず，CLI と client の版を揃えるために 3 つとも 7.9.1 に戻した．
  - Prisma 側の説明は見つからなかった（2026-10-03）．provenance 付きの 7.10.x が出たら上げる．`Dockerfile` の `prisma@7.9.1` も合わせる．
  - 再確認（2026-10-03）: 7.x の最新は依然 `7.10.0` で，`npm view prisma@7.10.0 dist.attestations` は空のままである．`@prisma/client` と `@prisma/adapter-pg` の 7.10.0 には provenance がある．状況は変わっていないので上げない．
  - Next.js は `16.3.8` が `latest` のままで，延期された Critical 1 件と High 1 件の修正版はまだ出ていない．
  - 再確認（2026-10-06）: Next.js の `latest` は `16.3.8`，Prisma の 7.x の最新は `7.10.0` で `dist.attestations` は空のまま．どちらも状況は変わっていない．

### DEP-5（Moderate，対応済み）: `postcss-selector-parser@6.0.10` に CPU を使い果たす脆弱性がある

- **事実**: 2026-10-06 の `pnpm audit` で GHSA-rj75-hqrm-r3gf（平坦なセレクターの解析が二次の計算量になる）が 1 件出た．修正は `>=7.1.6` で，6 系の最新 `6.1.4` も脆弱な範囲に入る．
- **経路**: `@tailwindcss/typography@0.5.20`（最新）が `postcss-selector-parser` を `6.0.10` に固定している．ほかに依存しているパッケージはない．
- **対応**: `586fee8` で `pnpm-workspace.yaml` の `overrides` に `postcss-selector-parser: "^7.1.6"` を足した．7.0.0 の破壊的変更は「走査中の挿入を安全にする」だけで，typography はセレクターを読むだけなので影響しないと判断した．
- **確認**: override の前後で `pnpm build` した CSS（`.next/static/chunks/*.css`）がバイト単位で一致した．`pnpm audit` は「No known vulnerabilities found」になり，vitest（105 件）は通った．typography が 7 系に上がったら override を外す．

## スクレイパーと同期処理

対象は `mf-scraper.ts`，`custom-scraper.ts`，`sync.ts`，`sync-lock.ts`，`scheduler.ts`，`onepassword.ts`，`hash.ts`，`src/actions/providers.ts`，`schema.prisma` である．
サブエージェントが全文を読んで報告した．High の項目，S-C3，S-T1，S-K2，S-P1 は元のコードで確かめ，「確認済み」と書いた．それ以外の項目の行番号は，報告のものをそのまま使っている．
`src/actions/system.ts` は元のコードで読み，「Server Actions と `src/lib/`」の末尾に記した．

`docs/d0001` の DATA-1（取引 ID がハッシュで，MF の act id を保存していない）は再掲しない．
補足すると，`mf-scraper.ts:1631-1638` の update 節には「ズレを補正する」とコメントがあるが，ID が同じ値から作られるので，補正として働かない．

対応状況（2026-10-03）: S-C1 は `898abbb`，S-C2・S-C3・S-C10 は `97b71b8`，S-L1・S-L3〜L6・S-N3・S-N4 は `3577e73`，S-K1・S-K2 は `f4b250a`，S-C5・S-C6・S-N1・S-T1 の Phase 1・S-H2 の `recalculateHoldingHistory` は `112ae81` で直した．
S-C4 は `2f51e08`，S-C11 は `7aa40ed`，S-P1 は `20fd73c`，S-L2 は `f906f51`，S-W1 は `09b45b9`，S-P2 は `2d611a9`，S-P3 は `ddce3c8`，S-N2 は `b31cf38` で直した．
S-C7 は `096a15b`，S-C8 は `eb8a702`，S-C9 は `5a21a20`，S-T1 の残りは `39ea194`・`e80c8d4`，S-T2 は `b582f47`，S-T3 は `a745bb7`（README は `1a235e9`），S-W2〜W4 は `7a996a8`，S-H2 の `buildTransferPairs` の O(n²) は `6b9e224` で直した．
S-H2 の残り（manual モードが毎回 `BACKFILL_START_DATE` まで遡って取得し直す）は直さない．手動同期の確認ダイアログが「`BACKFILL_START_DATE` まで遡って全件取得する」と明記しており，欠けた過去分を取り直すのが手動同期の目的だからである．日々の差分は auto モードの自動同期が取る．S-K3 も設計どおりなので直さない．
S-H1 は関数を分けて対応した．`saveTransactionsToDatabase` は `f58c07a`・`d23f875`・`197dc2f`・`64257b5`・`6da60c4` で 139 行，`scrapeBalanceHistory` は `5f716e2` で 183 行，`scrapeTransactions` は `116cd16` で 142 行，`runMfScraper` は `d92f6fc` で 126 行になった．`settings-content.tsx` は `aebb17e`・`37242ed` などで 103 行になった．移した本体は，HEAD との照合スクリプトで元のコードと一致することを確かめた．`runMfScraper` は Phase を順に呼ぶだけの処理なので，これ以上は分けない．
どの修正も，lint，typecheck，vitest で確かめただけで，実際の MF への同期では確かめていない（未実施）．

### データの整合性

**S-C1（High，確認済み）: 負債口座の履歴の逆算で，子口座を名前で突き合わせている**
- 場所: `mf-scraper.ts:2285-2361`
- 内容: 子口座と明細は，プロバイダー内の LIABILITY に絞って取得している．しかし，子口座ごとの集計は `tx.subAccount.currentName !== sa.currentName`（`2346`）と `currentName::date` のキー（`2335`，`2357`）で行う．
- 失敗する場面: 同じプロバイダーに同名の負債子口座が 2 つあると，両方の明細を合算して逆算し，`2443-2446` で履歴を全件置き換える．`buildSubAccountMergeName` は `sub_type` を優先するので，同名になりやすい．プロバイダーをまたいで混ざることはない．
- 対応: `subAccountId` で照合する．`allTransactions` の select に `subAccountId` を加える．

**S-C2（High，複数の MF アカウントを登録している場合．確認済み）: 残高履歴の取得が，同期中でないプロバイダーの口座も対象にしている**
- 場所: `mf-scraper.ts:1085-1093`，`1142-1147`
- 内容: `type: "mf", isActive: true` の全プロバイダーの mainAccount を，同期中のアカウントのセッションで処理する．`mfUrlId` で一致しないと，金融機関名で照合し直す．
- 失敗する場面: アカウント A の同期で，A にある同じ金融機関の履歴が B の子口座に書き込まれる．B のロックは取っていない．
- 対応: `providerId` を引数で受け取り，同期中のプロバイダーに絞る．

**S-C3（Medium，確認済み）: 証券口座への予備の照合が，処理中の子口座を確かめていない**
- 場所: `mf-scraper.ts:1269-1284`
- 内容: 子口座 1 件ごとの処理（`1245`）の中で，`matched` が「同じ mainAccount に INVESTMENT か CASH の口座が 1 つでもあるか」だけを見ている．
- 失敗する場面: 名前で照合できなかった子口座（POINT や別の CASH 口座など）に，証券サブ口座の残高履歴が書き込まれる．
- 補足: 子口座 1 件ごとに `subAccount.findMany` を実行している．`mainAccount.subAccounts` は取得済みである（`1092`）．

**S-C4（Medium）: 振替相手の口座を，金融機関もプロバイダーも絞らずに名前で探している**
- 場所: `mf-scraper.ts:1874-1893`（`allSubAccountsInDb` は `1592-1596` で全プロバイダーから取得している）
- 失敗する場面: 「普通預金」のような名前は複数の銀行にあるので，別の銀行の口座に振替が記録される．

**S-C5（Medium）: MF から消えた子口座の古い残高が，毎日記録され続ける**
- 場所: `mf-scraper.ts:1492-1518`
- 内容: 当日分の履歴を，プロバイダーの全子口座について `sa.balance` で upsert する．解約した口座や，その日に API が返さなかった口座も，前回の残高で記録される．

**S-C6（Medium）: 売却した保有銘柄が `Holding` に残り続ける**
- 場所: `mf-scraper.ts:452-556`
- 内容: upsert だけで，今回の取得結果にない銘柄を削除する処理や 0 にする処理がない．売却済みの投資信託が，最後の評価額のまま資産に計上される．

**S-C7（Medium，不確実）: カード請求の日付に `updated_at` を使っている**
- 場所: `mf-scraper.ts:225`，`230`
- 失敗する場面: 一意制約は `(subAccountId, billingDate)` なので，MF 側で更新日が変わるたびに同じ請求が別の行として増えるおそれがある．

**S-C8（Medium，不確実）: 長さの違う履歴の系列を，先頭をそろえて合算している**
- 場所: `mf-scraper.ts:1079-1081`，`1334-1338`
- 内容: 日付は `to_date` から長さだけ遡って割り当てる．`from_date` は読むが使っていない（`1067`）．短い系列は `to_date` 側でそろえるべきなので，日付がずれる．

**S-C9（Medium）: 一部の取得や保存に失敗しても，同期が「成功」として記録される**
- 場所: `mf-scraper.ts:240-249`，`1037-1043`，`1217-1222`，`1392-1401`，`1641-1643`，`2082-2087`
- 失敗する場面: 明細が欠けたまま Phase 5 が負債履歴を作り直し，正しかった履歴を上書きする．
- 対応: 成功，一部失敗，失敗を区別して記録する．一部失敗のときは Phase 5 を実行しない．

**S-C10（Low）**: 証券口座の ID が取れないと，`continue` が mainAccount のループに効き，その金融機関の残高履歴も取得されない（`mf-scraper.ts:1179`）．

**S-C11（Low）**: 振替ペアの 2 回の update がトランザクションでない（`mf-scraper.ts:1673-1686`）．

### 数値の解析

- **S-N1（Medium，不確実）**: 保有銘柄の `unitPrice`，`valuation`，`gainLoss` を丸めずに Int 列へ書いている（`mf-scraper.ts:473-475`）．小数が来ると Prisma が例外を出し，`544-549` で warn にされて銘柄が保存されない．`currency` と `jpyrate` は使われておらず，外貨建ても円換算されない．
- **S-N2（Low から Medium，不確実）**: 保有銘柄の JSON を `page.content()` の `<pre>` から正規表現で抜き出している（`mf-scraper.ts:322-333`）．`&` が `&amp;` になると銘柄名が変わり，別の行として作られるおそれがある．`locator('pre').textContent()` か `page.request.get` で取れば避けられる．
- **S-N3（Medium）**: `custom-scraper.ts:143`，`147`，`191` は CSV を `split(",")` で分けている．引用符や桁区切り（`1,234.5`）を含む値が壊れる．
- **S-N4（Medium）**: `custom-scraper.ts:50-54` はレートの取得に失敗すると 0 を返し，評価額 0 として保存する．`253` は残高 0 の通貨を飛ばすので，既存の `CryptoAsset` 行が古い値のまま残る．

### 日付とタイムゾーン

- **S-T1（Medium）**: 日付の計算がサーバーのローカル TZ を JST と仮定している（`mf-scraper.ts:809-821`，`856-883`，`1109-1110`，`1490-1491`，`2404-2433`）．TZ 未設定のホストで `mise sync` を実行すると，月のウィンドウがずれる．
  - 当日の履歴の日時（確認済み）: `todayJST()`（`utils.ts:68-79`）は TZ に依存せず「JST 00:00 に当たる UTC 時刻」を返す．Phase 1（`1490-1491`）はそれにローカル TZ の `setHours(8)` をかける．
  - TZ が JST なら JST 08:00（前日 23:00Z）になり，Phase 6（`1373`，`T08:00:00+09:00`）と一致する．コンテナは `Dockerfile` の `ENV TZ=Asia/Tokyo` なので重複しない．
  - TZ が UTC なら前日 08:00Z（JST 前日 17:00）になり，Phase 6 と別の行ができるうえ，日付も 1 日前にずれる．
  - 起きる条件（確認済み）: `mise.toml` は `.env` を読まないが，`mf-scraper.ts:1` と `sync.ts:1` が最初に `dotenv/config` を読み込む．`.env.example:6` に `TZ="Asia/Tokyo"` があるので，`mise setup` で作った `.env` なら JST になる．問題が起きるのは，`.env` に TZ がない場合（古い `.env` や手で作った `.env`）である．そのため重大度は Low から Medium とみてよい．
  - 対応: Phase 1 も Phase 6 と同じく，`formatJSTDate(today)` に `T08:00:00+09:00` を付けた文字列から `Date` を作り，TZ への依存をなくす．
- **S-T2（不確実）**: `recognized_at` の先頭 10 文字を日付にしている（`mf-scraper.ts:902`）．UTC 表記なら 1 日ずれる．
- **S-T3（Low）**: 08:00 を過ぎてから再起動すると，その日の分は実行されない．`setInterval` のずれも補正されない（`scheduler.ts:167-174`）．

### 待機とセレクタ

- **S-W1（Medium）**: パスワード送信の直後に `locator.count()` で OTP 入力欄の有無を判定している（`mf-scraper.ts:2588-2590`）．`count()` は待たないので，OTP 画面の表示が遅れると OTP を入力せずに進む．
- **S-W2（Low から Medium）**: 固定時間の待機が多い（`643`，`2609`，`2626`，`2675`，`2716`，`2726`）．OTP の再試行は 10 秒間隔なので，同じ 30 秒の窓で同じコードを再送しうる．
- **S-W3（Medium）**: 同期完了の判定が `img[src*="loading"]:visible` の件数だけで行われる（`mf-scraper.ts:2715`，`2718`，`623-634`）．画面の変更やログアウトで 0 件になると，更新前のデータを取得して成功と記録する．`reload` の失敗も握りつぶしている．
- **S-W4（Low）**: UA が Chrome 120 に固定されている（`2550`）．ログイン用セレクタは壊れると例外になるので，問題は表に出る．

### ブラウザとプロセスの後片付け

- **S-L1（Low）**: `custom-scraper.ts:75-77` のブラウザの準備が try の外にあり，失敗するとブラウザが閉じられない．
- **S-L2（Low から Medium）**: `runMfScraper` の `newContext`，`newPage`，`addInitScript` が try の外にある（`mf-scraper.ts:2525`，`2548-2560`）．失敗するとブラウザを閉じず，`activeBrowsers` からの削除もリスナーの解除も行わない．
- **S-L3（Medium）**: `custom-scraper.ts:292-293` は失敗しても終了コード 0 で終わるので，`sync.ts` が失敗に気付けない．custom 型の経路にはロックもない（`sync.ts:35-58`）．
- **S-L4（不確実）**: `.catch(logger.error)` で pino のメソッドを `this` なしで渡している（`sync.ts:74`，`custom-scraper.ts:300`）．TypeError になり，元のエラーが記録されない可能性がある．
- **S-L5（可能性が高い）**: `custom-scraper.ts:11` がアダプタなしで `new PrismaClient()` を生成している．datasource に url がない（`schema.prisma:6-8`）ので，Prisma 7 では起動時に失敗する可能性が高い．
- **S-L6（Low）**: CLI で 1 件失敗するとすぐ `process.exit(1)` し，残りのプロバイダーを処理せず `$disconnect` も呼ばない（`mf-scraper.ts:2834-2837`）．

### ロック

- **S-K1（Medium）**: `forceReleaseSyncLock` が持ち主を確かめずにロックを外す（`sync-lock.ts:81-86`，`providers.ts:214`）．`mise sync` の実行中に画面で中止すると，CLI は止まらずロックだけが外れ，次の同期と同じ行へ同時に書き込む．通常の解放と同じく，`lastSyncAt` を比べる条件付きの解放にすれば防げる．
- **S-K2（Medium，確認済み）**: `syncProvider` がプロバイダーの種類を確かめず，custom 型でも `runMfScraper` を呼ぶ（`providers.ts:131-166`）．`settings-content.tsx` で `provider.type` を見ているのはラベル表示（`1154`，`1312`，`1589`）だけで，同期ボタンは custom 型にも表示される．プロバイダー名を 1Password のアイテム名として MF にログインしようとする．
- **S-K3（Low，設計どおり）**: プロセスが落ちると，ロックの有効期限の 3 時間は「同期中」のまま残る．`releaseSyncLock` が DB の障害で失敗した場合も同じである（`providers.ts:175`，`185`）．

### 秘密情報と個人データ

**S-P1（Medium，確認済み）: 振替を解決できなかったときに，口座データを `debug/` へ書き出している**
- 場所: `mf-scraper.ts:1898-1964`
- 内容: `process.cwd()/debug/unresolved_transfers.json` に，生の API データ（摘要，金額，相手先の表示名）と，全プロバイダーの子口座一覧を書く．読み込んで追記する方式で，重複が増え続け，削除もローテーションもない．
- 確認したこと: `debug/` は `.gitignore` にも `.dockerignore` にも含まれていない（`git check-ignore` は該当なし）．現在，リポジトリに `debug/` はない．
- 失敗する場面: ローカルで同期すると，リポジトリ直下に作られ，`git add .` で commit される．コンテナでは `/app/debug` に書かれる．compose は `op-secrets.json` しかマウントしていないので，コンテナを作り直すまで書き込み可能レイヤーに溜まる．
- 対応: `.gitignore` に `/debug/` を足す．書き出しは開発時だけに限る．
- 補足: `1966-1977`，`980-996`，`2073-2081` は，摘要と金額を info log にも出している．

- **S-P2（Low から Medium）**: ログインの確認に失敗すると，ページ本文の先頭 500 文字とボタンの一覧を error log に出す（`mf-scraper.ts:2637-2655`，`2688-2693`）．セレクタだけが変わった場合，氏名や資産額が log に残る．
- **S-P3（Low，不確実）**: 1Password CLI の失敗時に，stderr を含む `err` を log に出している（`onepassword.ts:213-216`，`278-281`）．`217` のコメントは stderr が機密情報を含みうると書いている．
- 問題なしと確認したもの: スクリーンショット，トレース，`storageState` は保存していない．cookie はディスクに残らない．

### その他

- **S-X1（Low）**: 任意のコードを実行する経路は見つからなかった．`sync.ts:36-52` は `^[a-zA-Z0-9_-]+\.ts$` に一致し，`src/scraper` に実在するスクリプトだけを起動する．ただし，認証のない `createProvider`（`providers.ts:56-66`）で，どのスクリプトを実行するかは変えられる（`docs/d0001` の SEC-1 と関係する）．
- **S-H1（Low）**: 関数が長い．`saveTransactionsToDatabase`（`1529-2258`，約 730 行），`scrapeBalanceHistory`（`1057-1409`），`scrapeTransactions`（`743-1050`），`runMfScraper`（`2501-2799`）．
- **S-H2（Medium，性能）**: 同期のたびに全件を処理する箇所がある．`recalculateHoldingHistory`（`562-598`）は全プロバイダーの `HoldingHistory` を 1 行ずつ update し，証券口座ごとに呼ばれる（`1214`）．`buildTransferPairs`（`1646-1692`）は未振替の明細全体を O(n²) で照合する．manual モードは毎回 `BACKFILL_START_DATE` まで遡って取得し直す．

## Server Actions と `src/lib/`

対象は `src/actions/`，`src/lib/`，`prisma/`，`scripts/` である．サブエージェントが全文を読んで報告した．A-1，A-2，A-3，A-4 は元のコードで確かめた．

対応状況（2026-10-03）: A-1・A-4 は `1e9b558`，A-2 は `e238532`，A-3（同じ形の `transactions.ts` の 2 か所を含む）は `01654ca`，SYS-1・SYS-2 は `1bd8329`，A-8 は `5f62495`，A-11 の整形エラーは `409a5d3` で直した．
A-2 で `mainAccountUpdateSchema.label` を必須にしたが，画面からの `updateMainAccount` は `providerId` しか送らず，ルールの更新は画面から呼ばれていないので，既存の操作は変わらない．
A-7 は `8209ec0`，A-6 と A-9 は `f32ae9f`（`getAssetTypeComparison` ごと削除），A-10 は `756bc89`，A-12 は `7be39f0`，A-11 は `dae512f` で直した．A-5 は Next 16.3.8 の実装を読んで確かめ，コードは変えていない（下の A-5 を参照）．
どの修正も lint，typecheck，vitest で確かめただけで，画面では確かめていない（未実施）．

**A-1（Medium，確認済み）: AI 分析に渡す「前日比」がほぼ常に 0 になり，推移も 1 日ずれる**
- 場所: `src/actions/analysis.ts:142`，`255`
- 内容: 日ごとの合計のキーを `h.date.toISOString().slice(0, 10)`（UTC の日付）で作っている．残高履歴は JST 08:00（前日 23:00Z）で保存されるので，キーが 1 日前にずれる．一方，`255` の `yesterdayKey` は `formatJSTDate(yesterdayJST())` で正しく作る．
- 失敗する場面: 今日の合計が「昨日」のキーに入り，それを昨日の値として引くので，`dailyChange` が 0 になる．直近 30 日と 7 日の推移も 1 日ずれる．
- 対応: `142` を `formatJSTDate(h.date)` にする．

**A-2（Medium，スキーマは確認済み）: 更新時のバリデーションが空文字を通す**
- 場所: `src/lib/validations.ts:113`（`transferRuleUpdateSchema.keyword`），`122`（`mainAccountUpdateSchema.label`），`132`（`categoryRuleUpdateSchema.keyword`）
- 失敗する場面: カテゴリールールのキーワードを空文字に更新して `applyAllCategoryRules` を実行すると，`contains: ""` が未分類の明細すべてに当たり，1 つのカテゴリーにまとめて分類される（`contains` の挙動は報告による）．
- 対応: 作成時のスキーマと同じく `min(1)` を付ける．

**A-3（Low から Medium，確認済み）: `deleteSubCategory` がトランザクションでない**
- 場所: `src/actions/categories.ts:214-223`
- 内容: 明細の分類解除，ルールの削除，サブカテゴリーの削除を別々のクエリで実行する．最後の削除が失敗すると，分類とルールだけが消えた状態が残る．同じファイルの `deleteMainCategory` は，この状態をコメントで避けている．
- 同じ形: `transactions.ts:315-324`（`updateTransactionCategory`），`517-525`（`markTransactionAsTransfer` のルール作成）．

**A-4（Medium，確認済み）: 純資産の定義が，画面と AI 分析で違う**
- 場所: `src/actions/analysis.ts:149-151`
- 内容: `balance > 0` の口座だけを資産に足している．ダッシュボードと資産ページは，マイナス残高も含める定義にそろえてある．

**A-5（Medium，不確実）: ダッシュボードのキャッシュが同期後に更新されない可能性がある**
- 場所: `src/actions/dashboard.ts` の `unstable_cache`
- 内容: 付けたタグはどこからも `revalidateTag` されていない．`revalidatePath("/")` でこのキャッシュも消えるかは Next 16.3.8 の動作による．自動同期と `mise sync` はページを再検証しないので，最大 5 分古い表示が残る．
- 確認（2026-10-03，`node_modules/next` の実装）:
  - `unstable_cache` はエントリに，描画中のページの暗黙タグを `softTags` として付ける（`unstable-cache.js`）．読み出しでは `tags` と `softTags` を合わせて `revalidatedTags` と tags manifest に照らし，期限切れなら `null` を返して作り直す（`incremental-cache/index.js:381-420`）．そのため，画面からの同期と中止（`providers.ts:202`，`227`）の `revalidatePath("/")` で，ダッシュボードのキャッシュも消える．
  - `revalidateTag` と `revalidatePath` は `workAsyncStorage` の store がないと `Invariant: static generation store missing` を投げる（`revalidate.js`）．scheduler（`setTimeout` から呼ぶ）と `mise sync`（別プロセス）からは呼べない．
- 結論: 不確実だった点は「画面からの同期では起きない」と確かめた．自動同期と `mise sync` のあとは，TTL の 5 分まで古い表示が残る．同期は 1 日 1 回なので許容し，コードは変えていない．縮めるには TTL を短くするか，request の中から再検証する経路（Route Handler を叩くなど）が要る（未対応）．
- 対応（2026-10-07）: ダッシュボードの `unstable_cache` 3 件を廃止し，ほかのページと同じくアクセスのたびに DB を読むようにした．自動同期と `mise sync` のあとに古い表示が残る問題もなくなった．

- **A-6（Low）**: `getAssetTypeComparison`（`assets.ts:224-241`）が資産タイプごとではなく子口座ごとに `push` し，重複した配列を返す．どこからも呼ばれていない．
- **A-7（Low）**: `getAccountList`（`accounts.ts`）が口座ごとに請求データを問い合わせる（N+1）．同じ集計が，使われていない `getCreditCardBillingSummary` にもある．
- **A-8（Low）**: コメントと実際が食い違っている．`categories.ts:513` は `Transaction.subCategory` を Restrict と書くが，マイグレーションは `ON DELETE SET NULL` である．`dashboard.ts:98` の「JST 日付の UTC 0 時」は残高履歴には当てはまらない（計算は `formatJSTDate` を使うので結果は正しい）．`onepassword.ts:95` の「line 79」は実際には `103` で，冒頭に「をを」という誤字がある．
- **A-9（Low）**: 使われていない export がある．`getCreditCardBillingSummary`，`createManualAccount`，`remapSubAccount`，`detectTransfers`，`reorderMainCategory`，`reorderSubCategory`，`getAssetTypeComparison`，`subAccountUpdateSchema`，`prisma.ts` の `pool`．
- **A-10（Low）**: `income-expense.ts` と `assets.ts` の `getX = async () => getXInternal()` は，ログを出すだけのラッパーである．`toUtcDateOnly` が 3 ファイルに同じ内容で定義されている．
- **A-11（Low）**: `scripts/db-check.ts` は `package.json` からも mise からも参照されていない．biome の check で整形のエラーが 1 件出る（`88`）．
  - 追加で分かったこと: `import "dotenv/config"` がなく，`pnpm tsx scripts/db-check.ts` では `DATABASE_URL` が読まれず接続に失敗していた（`getaddrinfo EAI_AGAIN base`）．`.env` を読み込むようにし，`mise run db:check` を追加して，手元の DB で動くことを確かめた．
- **A-12（Low）**: `src/lib` のテストは `navigation.test.ts` だけである．`utils.ts` の JST 処理，`chart-format.ts`，`chart-time-range.ts`，バリデーションは DB なしでテストでき，A-1，A-2，S-T1 のような不具合を防げる．
- 補足: 取引 ID の衝突（同じ日に同じ店で同じ金額を 2 回払うと 1 件にまとまる）は，`docs/d0001` の DATA-1 の帰結である．`scraperScript` は画面から最大 10000 文字の文字列を登録できるが，実行時に `sync.ts` の正規表現で絞られる（S-X1）．作成時のスキーマでも同じ形式に絞るとよい．
- 問題なしと確認したもの: `nowJST()` と `formatJSTDate(nowJST())` は，9 時間を二重にずらしていない．

### `src/actions/system.ts`

元のコードで全文（59 行）を読んだ．

**SYS-1（Low）: 同期状態の取得が，開いているタブごとに 1 分に 1 回 info log を出す**
- 場所: `src/actions/system.ts:13`，`src/components/sync-status.tsx:140`
- 内容: `getLastSyncInfo` は呼ばれるたびに info log を出す．`sync-status.tsx` は 60 秒ごとに呼ぶので，タブ 1 つにつき 1 日 1,440 行になる．ログには上限がない（COMP-2）．
- 対応: debug にするか，削除する．

**SYS-2（Low）: 同期の結果は，最後に同期したプロバイダーの 1 件しか表示されない**
- 場所: `system.ts:37-45`
- 内容: 同期中を探す 1 つ目のクエリ（`14-26`）は `isActive: true` で絞るが，結果を探す 2 つ目のクエリは絞らない．また，`lastSyncAt` が最も新しい 1 件だけを返す．
- 失敗する場面: プロバイダー A の同期が失敗し，そのあと B が成功すると，表示は「完了」になり，A の失敗は見えない．無効にしたプロバイダーの結果も表示の対象になる．
- 対応: 2 つ目のクエリにも `isActive: true` を付ける．有効なプロバイダーのうち 1 つでも最新の結果が失敗なら，error を返す．

- 当てはまらなくなった指摘: サブエージェント（`ab69154d…`）は「scheduler が状態を実行中にしてから custom 型を `continue` で飛ばすので，実行中のまま残る」と報告した．現在の `scheduler.ts` は型の判定（`77`）をロックの取得（`90`）より前に行い，`system.ts:16` は TTL（3 時間）を過ぎたロックを同期中として扱わない．この指摘は `9fce99b` より前のコードについてのものである．

## UI

対象は `src/app/` と `src/components/`（`ui/*` を除く）である．サブエージェントが全文を読んで報告した．U-1 は元のコードで確かめた．

対応状況（2026-10-03）: U-1 は `d8ad321`，U-2 は `4b8e3d8`，U-3 は `e1ff75b`・`e274987`・`85c373a`・`9d15b36`・`6331553`・`aebb17e`・`37242ed`（103 行になった），U-4 は `d3c6420`，U-5 は `d6ddf28`，U-6 は `173e61e`，U-7 と U-8 は `c21677a`，U-9 は `3330a3a`，U-10 は `ecbbb1d`，U-11 は `8102286`，U-12 は `133dd37` で直した．
U-13 は，「X / X」の表示を `1abed0a`，`ComposedChart` を `4c54c3e`，資産テーブルの `key` を `3bf9d40` で直した．U-2 は `4384213` のテストで，`syncProvider` が同期の終わりを待たずに返り，同期の実行中に `abortSyncProvider` が終わることを確かめた．ブラウザでの確認は未実施である（MoneyForward へのログインと OTP の送信を伴う）．

**U-1（Medium，確認済み）: 明細のソートが，表示中の 1 ページ（50 件）の中でしか効かない**
- 場所: `src/actions/transactions.ts:115-117`，`src/components/transactions/transactions-content.tsx:160-170`
- 内容: サーバーは `orderBy: { date: "desc" }` と `skip/take` で切り出し，クライアントはそのページの中だけを並べ替える．
- 失敗する場面: 金額の昇順にしても，2 ページ目以降にある大きな支出は 1 ページ目に出ない．日付の昇順にしても，1 ページ目は月末側の 50 件が昇順に並ぶだけになる．
- 対応: ソートのキーと向きをサーバーアクションに渡し，`orderBy` に反映する．

**U-2（Medium，確認済み・修正済み）: 長い同期の実行中に，他のサーバーアクションが待たされる**
- 場所: `src/components/settings/settings-content.tsx:325-364`（`await syncProvider(id)`），`366-387`（中止）．分割後は `src/components/settings/provider-section.tsx`
- 内容: Next.js のクライアントがサーバーアクションを 1 件ずつ送る場合，手動同期の間は中止ボタンの `abortSyncProvider` が同期の完了まで送られない．`Promise.all` の並列読み込み（settings `236-242`，transactions `143-157`，income-expense `109-112`）も逐次になる．
- 確認: Next 16 の `node_modules/next/dist/client/components/app-router-instance.js` で，サーバーアクションがキューに積まれ，前のアクションの完了を待って 1 件ずつ実行されることをコードで確かめた．
- 対応: `syncProvider` は同期を始めてロックの印（`lockedAt`）をすぐ返し，スクレイピングは `runManualSync` として request の外で続ける．画面は 5 秒ごとに `getManualSyncResult(id, lockedAt)` で終わりを問い合わせ，終わったときの呼び出しで再検証する．中止を押すと問い合わせを先に止め，失敗の通知が重ならないようにした．
- テスト: `src/actions/providers.test.ts`（`4384213`）．scraper と DB をモックし，scraper が終わらないうちに `syncProvider` が印を返すこと，`getManualSyncResult` が `running` を返すこと，`abortSyncProvider` が終わって scraper に中止が届くことを確かめる．`void runManualSync` を `await` に戻すと 3 件とも失敗することも確かめた．
- 残り: 同期中に中止を押してすぐ止まるかのブラウザ確認．MoneyForward へのログインと OTP の送信を伴うため，ユーザーの了承を得てから行う．

**U-3（Medium，保守性）: `settings-content.tsx` が 2420 行あり，6 つの責務を持つ**
- 責務: プロバイダー，口座，カテゴリー（ドラッグでの並べ替え），仕訳ルール，振替ルール，インポートとエクスポート．`useState` は約 36 個ある（`142-227`）．
- 重複: 同期中の判定が 3 か所（`1132-1135`，`1319-1322`，`1364-1367`）．確認ダイアログがモバイル版とデスクトップ版で二重にある（プロバイダー `1234-1271` と `1424-1461`，口座 `1638-1676` と `1782-1820`，ルール `2104-2133` と `2173-2204`，振替ルール `2297-2326` と `2364-2397`）．

- **U-4（Low）**: 年別収支の取得の失敗を握りつぶし，エラー表示も再試行もないまま「年間収支推移」が消える（`income-expense-content.tsx:95-102`）．
- **U-5（Low）**: 同じ年の中で月を切り替えるたびに，年間推移の 12 か月分を取り直す（同 `109-112`，`123`）．
- **U-6（Low）**: settings の `fetchData`（`232-264`）に順序の制御がなく，古い応答が新しい応答を上書きしうる．transactions と income-expense には `requestIdRef` がある．
- **U-7（Low）**: 表示の不整合．バランスシートの Y 軸だけ `formatYAxisCurrency` を使っていない（`assets-content.tsx:471-472`）．積み上げ棒の角丸が逆で，頂上が角張る（同 `519-534`，`518` に「其上」という誤字）．
- **U-8（Low）**: 資産タイプの表示名を三項演算子で書き直していて，CASH，INVESTMENT，CRYPTO 以外はすべて「ポイント」になる（`assets-content.tsx:380-386`）．`utils.ts:180` の `assetTypeLabel` を使えばよい．
- **U-9（Low）**: `toLocaleString()` でロケールを指定していない（`calendar-grid.tsx:57,172,214,221`，`holding-table.tsx:179`，`account-detail-page-content.tsx:332,389`，`app/page.tsx:102,154,315,404`）．`formatCurrency` は `ja-JP` に固定している（`utils.ts:149`）．
- **U-10（Low）**: 空行の `colSpan={6}` に対して，ヘッダーは 5 列である（`settings-content.tsx:1469`）．
- **U-11（Low）**: 不要な型アサーション `(x as Category & { type: string }).type`（settings `248,253,1976,2066`，transactions `554,724`）．
- **U-12（Low）**: transactions で `SortIcon` を描画関数の中で定義している（`279-288`）．`availableSubAccounts` が毎回新しい配列になり，`useEffect` が毎レンダー動く（`120-129`，`217-224`）．
- **U-13（不確実）**: 収支内訳で，`/` のないカテゴリー名が「X / X」と表示される可能性がある（`income-expense-content.tsx:150-157`）．`BarChart` の中に `Line` を置いている（同 `545-641`，`676-766`．`ComposedChart` が確実）．資産テーブルの `key={a.name}` が，同名の口座で重複する可能性がある（`assets-content.tsx:356`）．
- 問題なしと確認したもの: Markdown の描画は `remark-gfm` だけで `rehype-raw` がなく，XSS の経路はない．`dangerouslySetInnerHTML` は `ui/chart.tsx:80` の定数だけで使っている．`params` は `await` している．クリックできる `div` や `span` はない．

## インフラ

`Dockerfile`，`docker-compose.yml`，`docker-compose.production.yml`，`.github/workflows/ci-cd.yml` を元のファイルで全文読んだ（2026-10-03）．
`docs/d0001` にある CI-1（action を `@main` で参照），CI-2（pull の失敗を無視），SEC-2（`op-secrets.json` が 644），OPS-1（バックアップがない）は再掲しない．
CI-1 と CI-2 は `89a6774`，SEC-2 と SEC-4 は `a5d04b2` で直した（SEC-2 は，コンテナの uid 1001 が読めるようにファイルを 0644 のままにし，`data/runtime` を 0700 にした）．OPS-1 は `c0061b0` で直した．デプロイで `migrate deploy` の前に `pg_dump -Fc` を取って `data/backups/` に保存し（0700 と 0600，新しい 10 件を残す），README に毎日の cron と `pg_restore --clean --if-exists --create` による復元を書いた．
手元の db コンテナで，同じ手順でダンプを取れること，ダンプを別の DB に戻すと `_prisma_migrations` が 18 件で一致すること，`--create` 付きの復元でダンプの後に足したテーブルが消えることを確かめた．cron の設定はデプロイ先で行う（未実施）．
デプロイ先での動作（healthy 待ち，1Password の停止処理）は，push 後のデプロイで確かめる（未実施）．

### DOCK-4（Medium，対応済み）: `chown -R` が runner イメージに約 2.19 GB の重複レイヤーを作っている

- **場所**: `Dockerfile:78`
- **事実**: `docker history` で確かめた（2026-10-03，キャッシュからの再ビルド）．
  - `67-75` 行目の `COPY --chown=nextjs:nodejs` で，所有者は既に `nextjs` になっている．内訳は，`node_modules` が 1.04 GB，Playwright が 688 MB，standalone が 58.5 MB である．
  - `78` 行目の `chown -R nextjs:nodejs /app /home/nextjs/.cache /pnpm` が，これらと `64` 行目の `/pnpm`（368 MB）を丸ごと書き直し，2.19 GB のレイヤーを足している．
- **影響**: `docs/d0001` の DOCK-2（イメージが約 5 GB）の主な原因の 1 つである．pull と起動のたびに転送量とディスクを使う．
- **対応**:
  - `78` 行目は，空のディレクトリだけを再帰なしで扱う（`mkdir -p .cache && chown nextjs:nodejs /app /app/.cache`）．
  - `/pnpm` の所有者を変える必要があるなら，`64` 行目の `pnpm add -g` と同じ `RUN` の中で `chown -R` する．同じレイヤーの中なら重複しない．
- **結果**: `0a8401f`．runner の最後の `RUN` は root が作ったディレクトリだけを再帰なしで `chown` し，`/pnpm` は `pnpm add -g` と同じ `RUN` で `chown -R` する．
  - 再ビルドしたイメージは 4,995,929,715 bytes から 2,840,294,568 bytes に減った．
  - 作ったイメージで，各ディレクトリの所有者が `nextjs` で書き込めること，`prisma` と `tsx` が動くこと，`nextjs` で Chromium が起動することを確かめた．
  - 同じ commit で，`pnpm dlx playwright install-deps` を `playwright@1.63.0` に固定した．固定しないと lockfile を無視して最新版を取るので，ビルド段で入れたブラウザと版がずれうる．

### CI-3（Medium，対応済み）: デプロイが `latest` タグを使うので，push した commit と違うイメージが動きうる

- **場所**: `docker-compose.production.yml:3`，`.github/workflows/ci-cd.yml:81`．ワークフローに `concurrency:` がない．
- **事実**: build-and-push は `latest` と `${{ github.sha }}` の 2 つのタグを付けるが，デプロイ先の compose は `latest` を pull する．`concurrency:` がないので，短い間隔で 2 回 push すると 2 つの実行が並行する．
- **失敗する場面**: 後の push のビルドが先に終わり，先の push のビルドがあとから `latest` を上書きすると，後の push のデプロイが古いイメージで起動する．CI-2（pull の失敗を `|| true` で無視）と重なると，どの版が動いているかをジョブの結果から判断できない．
- **対応**: ワークフローに `concurrency`（group を 1 つに固定し，`cancel-in-progress: false`）を付ける．compose のイメージを `ghcr.io/babcs2035/my-assets:${IMAGE_TAG:-latest}` にし，デプロイのスクリプトから `IMAGE_TAG=${{ github.sha }}` を渡す．前の版に戻すときも，タグを指定するだけで済む．
- **結果**: `f1349fe` で compose のイメージを `${IMAGE_TAG:-latest}` にし，`89a6774` でデプロイが `IMAGE_TAG=${{ github.sha }}` を渡すようにした．`concurrency` の group は `${{ github.workflow }}-${{ github.ref }}` とし，PR だけ `cancel-in-progress` にした（main への push は順に処理し，取り消さない）．

### CI-4（Medium，対応済み）: デプロイの成功を，コンテナが running であることだけで判断している

- **場所**: `ci-cd.yml:257-263`．`Dockerfile` にも compose にも healthcheck がない（app）．
- **事実**: `docker compose ps --status running` に `my-assets-app` があれば成功とする．起動直後に落ちて `restart: unless-stopped` で再起動を繰り返していても，確認した瞬間に running なら成功になる．HTTP の応答を確かめる処理も，失敗したときに前の版へ戻す処理もない．
- **対応**: デプロイ先で `curl -fsS http://127.0.0.1:${APP_PORT}/my-assets` を数回試し，失敗したらジョブを失敗にする．あわせて app に healthcheck を付ける．
- **結果**:
  - `f1349fe` で両方の compose の app に healthcheck を付けた．イメージに `curl` がないので，Node で静的な `/analysis` を取得する．`migrate deploy` と seed のために `start_period` を 120 s にした．新しいイメージと使い捨ての postgres で，約 21 s で healthy になり，閉じたポートでは終了コード 1 になることを確かめた．
  - `89a6774` で，デプロイが `docker inspect` の health を 5 s ごとに最大 240 s 見て，healthy でなければ失敗にする．app のログは取引のデータを含むので，失敗時にも出力しない．
  - 前の版へ自動で戻す処理は入れていない．戻すときは `IMAGE_TAG` に前の commit SHA を指定する．

### CI-5（Low から Medium，対応済み）: 1Password から認証情報を取れなくても，デプロイが続く

- **場所**: `ci-cd.yml:180-183`，`223-238`
- **事実**: `op item get` が失敗すると，warning を出して空の dict を返し，その item を `items` から外す．`items` が空でも `op-secrets.json` を書き出し，デプロイを続ける．
- **失敗する場面**: service account の token の期限切れや item 名の変更があると，デプロイは成功し，翌朝 08:00 の自動同期で初めて失敗が分かる．それまで使えていた `op-secrets.json` も，空の内容で上書きされる．
- **対応**: 指定した item が 1 つでも取れなかったら `sys.exit(1)` で止める（`set -euo pipefail` の下なのでデプロイも止まる）．書き出しは一時ファイルに書いてから `os.replace` で置き換える．SEC-2（権限）と同じ箇所なので，一緒に直す．
- **結果**: `89a6774` と `a5d04b2`．取れなかった item が 1 つでもあれば `sys.exit(1)` で止まり，前の `op-secrets.json` は残る．書き出しは `tempfile.mkstemp`（同じディレクトリ）と `os.replace` で行う．
  - 同じ commit で，シェルの単一引用符の中にある Python が `field.get('label')` を `field.get(label)` として受け取り，debug log が `None` を出していた不具合も直した．

### CI-6（Low，対応済み）: 使われていない `DATABASE_URL` を必須にしている

- **場所**: `ci-cd.yml:136-139`，`docker-compose.production.yml:9`
- **事実**: production の compose は `env_file` を使わず，app の `DATABASE_URL` を `POSTGRES_*` から組み立てる．デプロイ先の `.env` の `DATABASE_URL` は，app からも `docker compose run ... prisma migrate deploy` からも使われない．
- **影響**: `.env` の `DATABASE_URL` だけを直しても接続先は変わらないので，設定を変えるときに誤解しやすい．
- **対応**: 必須の確認から外し，`.env.example` に「production では `POSTGRES_*` から組み立てる」と書く．あわせて，`.env` の読み込みが `141-143` と `245-247` で 2 回ある点も整理する．
- **結果**: `89a6774` で必須の確認から外し，`cfa8d4e` で `.env.example` と README に「両方の compose が `POSTGRES_*` から組み立てる」と書いた．`.env` の読み込みは `ci-cd.yml:178-180` の 1 か所（`set -a` と `.`）にまとめた．

### CI-7（Low，対応済み）: PR では本番と同じビルドをしていない

- **事実**: ci-checks は lint，型検査，テストだけで，`pnpm build` も `docker build` もしない．Docker のビルドは main への push のあとだけ動く（`ci-cd.yml:50`）．
- **失敗する場面**: `next build` でしか出ないエラーや Dockerfile の誤りは，main に入ってから分かる．
- **対応**: ci-checks に `pnpm build` を足す．PR では `docker/build-push-action` を `push: false` で動かす（amd64 だけでよい）．
- **結果**: `89a6774`．`actionlint` は何も報告しなかった．PR での実行は次の PR で確かめる（未実施）．

### CI-8（Low，対応済み）: ワークフローと deploy ジョブに `permissions:` がない

- **場所**: `ci-cd.yml`（`permissions:` は build-and-push の `52` 行目だけ），`121`
- **事実**: ci-checks と deploy の `GITHUB_TOKEN` には，リポジトリの既定の権限が付く．deploy はこの token をデプロイ先に送り，`docker login` で `~/.docker/config.json` に暗号化せずに保存する（以前のデプロイのログに warning が出ていた）．
- **影響**: token はジョブの終了で失効するので，影響は小さい．ただし，既定の権限が write の設定だと，その間は書き込みもできる．
- **対応**: ワークフローの先頭に `permissions: contents: read` を付け，deploy には `packages: read` だけを足す．
- **結果**: `89a6774`．あわせて，すべての action を最新リリースの commit SHA に固定した（CI-1）．

### COMP-1（Low から Medium，対応済み）: production の DB の healthcheck が `DB_PORT` を見ている

- **場所**: `docker-compose.production.yml:29`，`41`
- **事実**: postgres は `-p 5432` に固定して起動するが，healthcheck は `-p ${DB_PORT:-5432}` に接続する．production の db はポートを公開しないので，`DB_PORT` は使われない．
- **失敗する場面**: ホスト側のポートの衝突を避けるために `.env` の `DB_PORT` を 5432 以外にすると，healthcheck が成功しない．app は `condition: service_healthy` で待つので起動しない．`.env.example:12` は `5432` なので，既定のままなら起きない．
- **対応**: healthcheck を `-p 5432` に固定する．
- **結果**: `f1349fe`（`pg_isready -h 127.0.0.1 -p 5432`）．

### COMP-2（Medium，対応済み）: コンテナのログに上限がない

- **場所**: `docker-compose.yml`，`docker-compose.production.yml`（どちらも `logging` の指定がない）
- **事実**: Docker の既定の `json-file` ドライバーは，`/etc/docker/daemon.json` で `log-opts` を指定しない限りローテーションしない．デプロイ先の `daemon.json` はリポジトリからは分からない．
- **影響**: 同期処理は摘要と金額を info log に出している（S-P1 の補足）．SYS-1 のログも加わる．ログが際限なく増え，個人の金融データがホストのディスクに残り続ける．
- **対応**: 両方の compose の app に `json-file` の `max-size` と `max-file` を指定する．
- **結果**: `f1349fe` で両方の compose の app を 10 MB × 3 にした．compose で指定したので，デプロイ先の `daemon.json` には左右されない．db も `dcb5d37` で同じく 10 MB × 3 にした．

### CSP-1（High，対応済み）: 本番で Cloudflare の Rocket Loader が CSP に止められていた

- **場所**: `src/proxy.ts`（`4f8f4c8` の nonce 方式）
- **事実**: 本番では，前段の Cloudflare が Rocket Loader の `rocket-loader.min.js` を HTML に差し込む．このスクリプトには nonce が付かないので，`script-src 'self' 'nonce-...' 'strict-dynamic'` に止められ，ブラウザのコンソールに CSP 違反が出ていた．
  - Cloudflare の文書（Content Security Policies）が Rocket Loader に必要としているのは `script-src 'self' ajax.cloudflare.com` だけで，nonce と `'strict-dynamic'` には触れていない．
  - アプリ側で除外するには，HTML の `<script>` の `src` より前に `data-cfasync="false"` を書く必要がある（Ignore JavaScripts）．Next.js が出力する `<script>` には付けられない．
  - `Cache-Control: no-transform` で Rocket Loader が止まるかは，文書に書かれていない（Polish と圧縮が止まることだけが書かれている）．
- **対応**: ユーザーの判断（2026-10-03）で，Cloudflare 側で Rocket Loader を止める案ではなく，CSP を緩める案を採った．`25aa213` で `script-src 'self' 'unsafe-inline' ajax.cloudflare.com` に戻し，nonce と，nonce のためだけにあった root layout の `force-dynamic` を外した．`docs/d0001` の C2（`4f8f4c8`）はこれで取り消された．
  - production build で，`/analysis` と `/_not-found` が静的（`○`）に戻り，DB を読む 7 ページは動的（`ƒ`）のままであることを確かめた．
  - `next start` と Chromium で，`/`，`/analysis`，`/settings`，404 のすべてに新しい CSP が付き，ページを開いたときとクライアント側の遷移で CSP 違反とページのエラーが 0 件であることを確かめた．
- **残る点**:
  - インラインスクリプトの注入は CSP では防げない．Cloudflare で Rocket Loader を止めれば，nonce 方式に戻せる．
  - Rocket Loader は `<script>` の実行を遅らせるので，hydration の順序が崩れる可能性は残る．手元では再現できず，本番の前段に Basic 認証があるため，push 後にユーザーのブラウザで確かめる必要がある（未実施）．
  - Cloudflare の Early Hints は，保存した `Link` ヘッダーを `103` で返す．古い nonce が入っていたが，font の preload だけなので実害はない．nonce をやめたので，今後は新しい nonce は入らない．

### 問題なしと確認した項目（インフラ）

- app と DB のポートは `127.0.0.1` にだけ公開している．production の DB はポートを公開しない．
- `POSTGRES_PASSWORD` の既定値 `my-assets_password` は，デプロイでは使われない．`ci-cd.yml:173-176` が空の値を弾く．
- `OP_SERVICE_ACCOUNT_TOKEN` は，デプロイ先のホストの `op` だけが使い，production の app コンテナには渡していない．

## 調べてわかったこと

- **Next.js は事前告知型のセキュリティリリースに移った**: 2026 年 7 月から，修正の 1 週間前に告知が出る．告知と実際の版がずれることがある（9 月は `16.3.7` の予定が `16.3.8` に変わり，9 件が 7 件に減った）．影響の判断は，公開後の告知本文で行う．
- **`tvly search` を `&` で並列に実行し `-o` で保存すると，結果が保存されないことがあった**: エラー出力を捨てていたため原因は見ていない．1 件ずつ実行し，標準出力を `jq` に渡すと確実に取れた．
- **このホストのシェルは zsh である**: `grep --include=*.ts` や `ls compose*` のようにクォートしないグロブは，一致するファイルがないと `no matches found` で失敗する（`nomatch`）．`'*.ts'` とクォートする．
- **サブエージェントの出力ファイルは会話の記録（JSONL）である**: 600 KB を超えると Read で読めない．最後の assistant メッセージの text だけを Python で取り出すと，省略のない報告を読める．
- **`COPY --chown` のあとの `chown -R` は容量を倍にする**: 所有者だけを変えても，ファイル全体が新しいレイヤーに書き直される．
- **rebase で記録の commit hash が古くなる**: `docs/d0001` の `a5cfec8` と `b41534f` は rebase 前の hash で，`main` には tree の同じ `662f15c` と `93b8c05` として入っていた．記録に書く hash は，`git merge-base --is-ancestor <hash> HEAD` で `main` に含まれることを確かめる．
- **極端に短いサブエージェントの報告は，起動の失敗である**: 357 文字の報告 3 件は，API の `CONFLICT_REQUEST` で起動できなかったときの記録だった．同じ範囲は別のエージェントがやり直していた．
- **本番の前段には Cloudflare と Basic 認証がある**: 応答に `www-authenticate: Basic realm="Restricted"` が付く．本番のページは認証なしでは取れないので，CSP などの確認は手元の production build で行い，Cloudflare が書き換える部分はユーザーのブラウザで確かめる．`docs/d0001` の SEC-1 は「認証がない」ではなく「前段の認証に頼っていることが README に書かれていない」問題として扱う．
- **zsh では `status` が読み取り専用の変数である**: `status=$?` と書くとシェルが止まり，後続の後片付けが動かない．別の名前（`rc` など）を使う．
- **`pkill -f` は自分を実行しているシェルにも一致する**: パターンがコマンド行に含まれるため，シェルごと終了する（終了コード 144）．`pgrep -af '[n]ext-server'` のように最初の文字を `[]` で囲むか，`ss -ltnp` で PID を確かめて `kill <PID>` する．
- **`pnpm add` のあとは `prisma generate` が要る**: generator は `prisma-client-js` で `output` がないので，生成物は `node_modules/.prisma/client` にある．`pnpm add` で `node_modules` が組み直されると消え，`@prisma/client` の型がなくなって typecheck が数十件失敗する．`pnpm build`（中で `prisma generate` を実行する）のあとに typecheck を実行し直すと通るので，並行実行が原因に見えやすい．CI は `pnpm install` のあとに `prisma generate` を実行しているので影響しない．
- **pnpm の `trustPolicy: no-downgrade` は公開日の順で判定する**: semver ではなく，先に公開された版に trusted publisher の証拠があり，新しい版にないと `ERR_PNPM_TRUST_DOWNGRADE` で止める．`npm view <pkg>@<ver> _npmUser dist.attestations --json` で publisher と provenance を比べられる．
- **Read は，前に読んだファイルの中身を返さないことがある**: 会話が要約されて内容が消えていても，ファイルが変わっていなければ「前の結果を見よ」と返す．そのときは `cat -n` で読み直す．
