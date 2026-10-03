import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * カテゴリーの収支タイプに応じたアイコンを返すヘルパーである．
 */
export function CategoryTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  if (type === "INCOME") return <TrendingUp className={className} />;
  return <TrendingDown className={className} />;
}
