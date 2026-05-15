/**
 * Defense-in-depth 用の認証ガードヘルパー．
 * Server Actions から呼び出し，Basic Auth の環境変数が設定されていることを確認する．
 * 本番環境で未設定の場合はエラーをスローする．
 */
export function requireAuth() {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.BASIC_AUTH_USER || !process.env.BASIC_AUTH_PASSWORD)
  ) {
    throw new Error("Authentication is not configured");
  }
}
