// src/proxy.ts が応答に付ける CSP とセキュリティ関連のヘッダーを検証する．
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

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

describe("proxy", () => {
  it("script-src に nonce と 'strict-dynamic' を含めず，Rocket Loader のスクリプトを許可する", () => {
    // Cloudflare の Rocket Loader が差し込むスクリプトには nonce が付かないので，
    // nonce か 'strict-dynamic' があると本番でスクリプトが止められる
    const scriptSrc = findScriptSrcDirective(
      proxy().headers.get("Content-Security-Policy") ?? "",
    );

    expect(scriptSrc).not.toMatch(/'nonce-/);
    expect(scriptSrc).not.toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("ajax.cloudflare.com");
  });

  it("CSP 以外のセキュリティ関連のヘッダーを付ける", () => {
    const response = proxy();

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });
});
