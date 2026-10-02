/**
 * ページの応答にセキュリティ関連のヘッダー（CSP，X-Frame-Options など）を付ける proxy である．
 * Next.js は basePath（`/my-assets`）を matcher の先頭に自動で付けるので，matcher には basePath を書かない．
 * 実際に一致する範囲は，ビルド後の `.next/server/functions-config-manifest.json` の `matchers[].regexp` で確かめられる．
 */
import { NextResponse } from "next/server";

// 開発時は React がサーバー側のエラーのスタックを復元するために eval を使うので，'unsafe-eval' を足す
const isDev = process.env.NODE_ENV === "development";

// HTML の <script> には nonce を付けていないので，'strict-dynamic' は使えない（付けると 'self' も無視され，すべてのスクリプトが止まる）．
// Next.js が出力するインラインスクリプトを動かすために 'unsafe-inline' を許可する．
// nonce 方式にすると全ページが動的レンダリングになるため，静的なページを保てるこちらを選んでいる
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
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
