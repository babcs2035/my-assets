import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getAccountDetail, getCreditCardBillings } from "@/actions/accounts";
import { AccountDetailPageContent } from "@/components/accounts/account-detail-page-content";

export const dynamic = "force-dynamic";

// generateMetadata と page は同じリクエストの中で別々に呼ばれる．getAccountDetail は
// 保有銘柄や履歴をすべて含む重いクエリなので，リクエスト内で 1 回にまとめる (ACC-5)．
// "use server" のファイルは async 関数しか export できないため，ここで包む
const retrieveAccountDetailOncePerRequest = cache(getAccountDetail);

/**
 * 口座詳細ページメタデータを生成する．
 * 口座名が動的にタイトルに反映される．
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const account = await retrieveAccountDetailOncePerRequest(id);
  if (!account) {
    return { title: "口座詳細 | My Assets" };
  }
  return {
    title: `${account.label} | My Assets`,
    description: `${account.provider.name} - ${account.label} の詳細`,
  };
}

/**
 * 口座詳細ページコンポーネントである．
 * ガイドブック: タイトルにページの内容を正確に表記する．
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [account, billings] = await Promise.all([
    retrieveAccountDetailOncePerRequest(id),
    getCreditCardBillings(id),
  ]);
  // クライアントで「見つかりません」と出すだけでは HTTP 200 の soft 404 になるため，
  // サーバーで 404 を返して not-found.tsx を表示する (UI-5)
  if (!account) {
    notFound();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* key を口座 ID にすると，/accounts/A → /accounts/B の切替で
          銘柄の選択状態などの子コンポーネントの状態が確実にリセットされる */}
      <AccountDetailPageContent
        key={account.id}
        initialAccount={account}
        billings={billings}
      />
    </div>
  );
}
