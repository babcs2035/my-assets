/**
 * ページの応答にセキュリティ関連のヘッダー（CSP，X-Frame-Options など）を付ける proxy である．
 * CSP の script-src は，リクエストごとに生成する nonce で許可する．Next.js はリクエストの CSP ヘッダーから nonce を読み取り，
 * 自身が出力する <script> に付けるので，ページ側で nonce を扱う必要はない．
 * nonce は描画時にしか付けられないため，すべてのページを動的レンダリングにしている（`src/app/layout.tsx` の `dynamic`）．
 * Next.js は basePath（`/my-assets`）を matcher の先頭に自動で付けるので，matcher には basePath を書かない．
 * 実際に一致する範囲は，ビルド後の `.next/server/functions-config-manifest.json` の `matchers[].regexp` で確かめられる．
 */
import { type NextRequest, NextResponse } from "next/server";

// 開発時は React がサーバー側のエラーのスタックを復元するために eval を使うので，'unsafe-eval' を足す
const isDev = process.env.NODE_ENV === "development";

/**
 * リクエストごとに nonce を作って CSP を組み立て，応答にセキュリティ関連のヘッダーを付けて次の処理へ渡す関数である．
 * Server Actions は同じオリジンから呼ぶので，CORS のヘッダーは付けない．
 * X-XSS-Protection は現在のブラウザでは使われていないので付けない．
 */
export function proxy(request: NextRequest): NextResponse {
  // nonce は攻撃者に推測されると意味がないので，リクエストごとに乱数から作る
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = [
    "default-src 'self'",
    // 'strict-dynamic' により，nonce を持つスクリプトが読み込んだスクリプトも許可される（代わりに 'self' は無視される）
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Radix UI や recharts は style 属性を，src/components/ui/chart.tsx は <style> 要素を直接出力する．
    // nonce は style 属性には効かず，nonce を書くと 'unsafe-inline' が無視されるので，style-src には nonce を使わない
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

  // Next.js は描画時に「リクエストの」CSP ヘッダーから nonce を読むので，応答と同じ CSP をリクエストにも付ける
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
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
