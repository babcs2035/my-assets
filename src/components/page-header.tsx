import type { ComponentType, ReactNode, SVGProps } from "react";

/**
 * 全ページ共通のページヘッダーコンポーネントである．
 * ガイドブック: タイトルにデータ種別・メタ情報を併記し，見る人が迷わないようにする．
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  icon,
}: {
  title: string;
  description?: string;
  meta?: string;
  actions?: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  const Icon = icon;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          {Icon && <Icon className="h-6 w-6 text-zinc-400 shrink-0" />}
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-base text-zinc-500">{description}</p>
        )}
        {meta && <p className="mt-0.5 text-sm text-zinc-600">{meta}</p>}
      </div>
      {actions && <div className="mt-2 shrink-0 sm:mt-0">{actions}</div>}
    </div>
  );
}
