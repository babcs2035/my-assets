# 依存パッケージとツールの更新（2026-10-03）

`5640507` 時点から，依存パッケージとツールを最新の安定版へ上げた作業の記録．
上げたもの，据え置いたもの，作業中にわかった問題をまとめる．

## 結果

| commit | 内容 |
| :--- | :--- |
| `a9dbe3d` | pnpm 11.20.0 → 12.8.1（`package.json`，`mise.toml`，`Dockerfile`，`pnpm-lock.yaml`）．mise では `aqua:pnpm/pnpm` で入れる |
| `c68432a` | binfmt `qemu-v8.1.4` → `qemu-v10.2.3`（`.github/workflows/ci-cd.yml:99`） |
| `b7e7362` | `biome.json` の `$schema` を 2.5.15 にし，非推奨の `linter.rules.recommended` を `linter.rules.preset` に置き換え |
| `d4cd300` | 推移的依存のパッチ版とマイナー版を，名前を指定して更新 |

据え置いたもの（ユーザーの決定）: Prisma 7.9.1，PostgreSQL 16 系，Node.js 24.21.0 LTS．

## 確認したこと

- `pnpm install --frozen-lockfile`，`pnpm prisma generate`，`pnpm tsc --noEmit`，`pnpm biome ci ./src`，`pnpm test`（47 件），`pnpm build` が通る．build のルート一覧は更新前と同じ．
- amd64 の `docker build` が通る（pnpm 12 での `pnpm add -g` と `pnpm dlx` を含む）．
- 使い捨ての `postgres:16-alpine` に対して既定の `CMD` で起動し，`prisma migrate deploy`（18 件），seed，本番と同じ healthcheck（`/my-assets/analysis` が 200）が通る．
- pre-commit hook（`mise run check`）が通る．
- まだ確かめていないこと: arm64 のビルド，CI の `mise-action` での aqua 経由の pnpm のインストール．どちらも push 後の CI でしか確かめられない．

## わかったこと

### UPG-1（High，対応済み）: mise の npm バックエンドで入れた pnpm 12 は起動できない

- **事実**: pnpm 12 の npm パッケージの `pnpm` は shebang のない仮のファイルで，`preinstall` と `postinstall`（`node install.js`）でネイティブバイナリに置き換わる．mise 2026.8.3 の npm バックエンド（aube）は lifecycle scripts を実行せず，shim は `exec node <target>` で起動するので，`SyntaxError: Invalid or unexpected token` で落ちる．
- **影響**: `"npm:pnpm" = "12.8.1"` のままだと，pre-commit hook と CI の `mise-action` が失敗する．
- **対応**: `mise.toml:3` で `aqua:pnpm/pnpm` を使う．aqua は GitHub Releases のビルド済みバイナリを取るので，scripts にも node にも依存しない．`Dockerfile` の `npm install -g` は scripts を実行するので変えていない．
- **確認方法**: `mise which pnpm` が `aqua-pnpm-pnpm/12.8.1/pnpm` を返し，`file -L` で ELF と出ること．

### UPG-2（Medium，回避済み）: 全体の `pnpm update` は `d3-format` を 2 メジャー下げる

- **事実**: `--latest` なしの `pnpm update` で，`d3-scale@4.0.2` の参照先が `d3-format` 3.1.2 → 1.4.5，`d3-time-format` 4.1.0 → 3.0.0 に下がった．どちらも `d3-scale` の範囲（`1 - 3`）には入っている．nivo がすでに持ち込んでいる 1.4.5 に揃えられたように見えるが，pnpm の解決の仕方は確かめていない．
- **影響**: recharts は `victory-vendor` 経由で `d3-scale` を使う．d3-format は 2.0 で既定のマイナス記号を `-` から `−`（U+2212）に変えたので，グラフの目盛りの表示が変わるおそれがある．テストと build では検出できない．
- **対応**: 全体の `pnpm update` は採用せず，パッチ版とマイナー版の更新があったパッケージだけを名前で指定して更新した（`d4cd300`）．
- **確認方法**: lockfile の最後の `snapshots:` から「パッケージ → 依存名 → バージョン」の組を前後で取り出して比べ，メジャー版が下がった組がないことを見る．
- **付随する事実**: 全体の `pnpm update` は，範囲内で上げた直接依存の範囲指定の下限も書き換える（`lucide-react` が `^1.49.0` → `^1.50.0`）．

### UPG-3（Low）: pnpm 12 の lockfile は 2 つの YAML ドキュメントになる

- **事実**: pnpm 12 は `packageManager` の版を，lockfile の先頭にある別のドキュメント（`packageManagerDependencies`）に記録する．アプリの依存のドキュメントは変わらない．
- **影響**: lockfile を読むスクリプトは，最初の `snapshots:` ではなく最後の `snapshots:` を使う必要がある．

### UPG-4（Low）: `biome migrate` は `$schema` 以外も書き換える

- **事実**: Biome 2.5 で `linter.rules.recommended` が非推奨になり，`biome migrate --write` は `"preset": "recommended"` に置き換える．公式の設定リファレンスでは，同じ推奨規則を有効にする後継の設定とされている．移行の前後で `biome ci ./src` の結果は同じだった．

### その他

- pnpm 12 の `--depth` は整数だけを受け付ける（`--depth Infinity` はエラー）．
- `pnpm peers check` の警告（`@tremor/react@3.18.7` が react ^18 を要求）と，`recharts@2.15.4` の deprecated 警告は，更新の前からある．
- リポジトリの外: `~/.config/mise/config.toml` も `"npm:pnpm" = "latest"` なので，このリポジトリの外では UPG-1 と同じ壊れた bin が使われうる（試していない）．`"aqua:pnpm/pnpm" = "latest"` への変更を勧める．mise は 2026.10.0 が出ている（今は 2026.8.3）．
