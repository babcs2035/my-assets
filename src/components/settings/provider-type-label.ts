/**
 * プロバイダーのタイプ表示名を返すヘルパー関数である．
 */
export function getProviderTypeLabel(type: string): string {
  if (type === "mf") return "MoneyForward";
  if (type === "custom") return "カスタム";
  return type;
}
