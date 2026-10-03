/**
 * ページの応答にセキュリティ関連のヘッダー（CSP，X-Frame-Options など）を付ける proxy である．
 * Next.js は basePath（`/my-assets`）を matcher の先頭に自動で付けるので，matcher には basePath を書かない．
 * 実際に一致する範囲は，ビルド後の `.next/server/functions-config-manifest.json` の `matchers[].regexp` で確かめられる．
 */
import { NextResponse } from "next/server";

// 開発時は React がサーバー側のエラーのスタックを復元するために eval を使うので，'unsafe-eval' を足す
const isDev = process.env.NODE_ENV === "development";

// script-src には nonce と 'strict-dynamic' を使わず，'unsafe-inline' を許可する．
// 本番の前段にある Cloudflare の Rocket Loader は，nonce の付かない自身のスクリプトを HTML に差し込む．
// Cloudflare は Rocket Loader の nonce 対応を記載しておらず，nonce 方式では Rocket Loader のスクリプトが CSP に止められる．
// 代わりに，注入されたインラインスクリプトは CSP では防げない（Cloudflare 側で Rocket Loader を止めれば nonce 方式に戻せる）
const contentSecurityPolicy = [
  "default-src 'self'",
  // ajax.cloudflare.com は，Cloudflare の文書が Rocket Loader に必要としている配信元である
  `script-src 'self' 'unsafe-inline' ajax.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  // Radix UI や recharts は style 属性を，src/components/ui/chart.tsx は <style> 要素を直接出力するので，'unsafe-inline' を許可する
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * 応答にセキュリティ関連のヘッダーを付けて，リクエストをそのまま次の処理へ渡す関数である．
 * Server Actions は同じオリジンから呼ぶので，CORS のヘッダーは付けない．
 * X-XSS-Protection は現在のブラウザでは使われていないので付けない．
 */
export function proxy(): NextResponse {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}

export const config = {
  matcher: [
    // basePath があると，下の項目は `/my-assets` の直後の `/` を必須にするため，ルート（`/my-assets`）に一致しない．
    // ルートは別の項目として指定する
    "/",
    // _next/static と _next/image はハッシュ付きの静的ファイルなので，ヘッダーを付けなくてよい
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
