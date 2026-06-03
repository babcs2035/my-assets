import type { Metadata } from "next";
import { getAccountList } from "@/actions/accounts";
import { AccountList } from "@/components/accounts/account-list";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import logger from "@/lib/logger";

/**
 * 動的レンダリングを強制するための設定である．
 */
export const dynamic = "force-dynamic";

/**
 * 口座管理ページメタデータである．
 */
export const metadata: Metadata = {
  title: "口座管理 | My Assets",
  description: "金融機関と口座の一覧を管理するページ",
};

/**
 * 口座管理ページコンポーネントである．
 * ガイドブック: タイトルにページの内容を正確に表記する．
 */
export default async function AccountsPage() {
  logger.info("📂 Rendering AccountsPage...");
  const accounts = await getAccountList();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="口座管理"
        description="金融機関と配下の口座を管理します"
      />

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-zinc-500">
              まだ口座が登録されていません
            </p>
            <p className="text-xs text-zinc-400 mt-2">
              設定ページから口座を追加してください
            </p>
          </CardContent>
        </Card>
      ) : (
        <AccountList accounts={accounts} />
      )}
    </div>
  );
}
