// src/proxy.ts が付ける CSP の nonce とセキュリティ関連のヘッダーを，Request から Response までで検証する．
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const PAGE_URL = "http://localhost:3000/my-assets/settings";

/**
 * CSP の値から script-src ディレクティブを取り出す関数である．
 */
function findScriptSrcDirective(contentSecurityPolicy: string): string {
  return (
    contentSecurityPolicy
      .split("; ")
      .find(directive => directive.startsWith("script-src ")) ?? ""
  );
}

/**
 * CSP の値から nonce を取り出す関数である．nonce がなければ null を返す．
 */
function findNonce(contentSecurityPolicy: string): string | null {
  return contentSecurityPolicy.match(/'nonce-([^']+)'/)?.[1] ?? null;
}

describe("proxy", () => {
  it("script-src を nonce と 'strict-dynamic' で許可し，'unsafe-inline' を含めない", () => {
    const response = proxy(new NextRequest(PAGE_URL));
    const scriptSrc = findScriptSrcDirective(
      response.headers.get("Content-Security-Policy") ?? "",
    );

    expect(scriptSrc).toMatch(/'nonce-[^']+'/);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("リクエストごとに異なる nonce を使う", () => {
    const first = proxy(new NextRequest(PAGE_URL));
    const second = proxy(new NextRequest(PAGE_URL));

    expect(
      findNonce(first.headers.get("Content-Security-Policy") ?? ""),
    ).not.toBe(findNonce(second.headers.get("Content-Security-Policy") ?? ""));
  });

  it("描画に渡すリクエストにも応答と同じ CSP を付ける", () => {
    const response = proxy(new NextRequest(PAGE_URL));

    // NextResponse.next({ request: { headers } }) で書き換えたリクエストヘッダーは，
    // x-middleware-request-<name> として応答に載り，Next.js が描画前にリクエストへ反映する
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(response.headers.get("Content-Security-Policy"));
  });

  it("CSP 以外のセキュリティ関連のヘッダーを付ける", () => {
    const response = proxy(new NextRequest(PAGE_URL));

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });
});
