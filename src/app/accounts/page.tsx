import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getAccountList } from "@/actions/accounts";
import { AccountList } from "@/components/accounts/account-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
        actions={
          <Link href="/accounts/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              口座を追加
            </Button>
          </Link>
        }
      />

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-zinc-500">
              まだ口座が登録されていません
            </p>
            <Link href="/accounts/new" className="mt-4">
              <Button variant="outline" size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                最初の口座を追加
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <AccountList accounts={accounts} />
      )}
    </div>
  );
}
