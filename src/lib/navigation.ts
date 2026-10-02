/**
 * サイドバーの項目が現在のページに対応するかを判定する関数である．
 * pathname には usePathname() の戻り値（basePath を除いたパス，例: `/assets`）を渡す．
 */
export function isNavHrefActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  // `/accounts` が `/accounts-foo` のような別のページに一致しないよう，区切りの `/` まで含めて比べる
  return pathname === href || pathname.startsWith(`${href}/`);
}
