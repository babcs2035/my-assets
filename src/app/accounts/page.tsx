import { Building2, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { getAccounts } from "@/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assetTypeColor, assetTypeLabel, formatCurrency } from "@/lib/utils";

/**
 * 動的レンダリングを強制するための設定である．
 */
export const dynamic = "force-dynamic";

/**
 * 口座管理ページコンポーネントである．
 * 登録されている金融機関 (メイン口座) の一覧および配下の子口座の概要を表示する．
 */
export default async function AccountsPage() {
  console.log("📂 Rendering AccountsPage...");
  const accounts = await getAccounts();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ページヘッダーエリア */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            口座管理
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            金融機関と配下の口座を管理します．
          </p>
        </div>
        <Link href="/accounts/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            口座を追加
          </Button>
        </Link>
      </div>

      {/* 口座表示エリア */}
      {accounts.length === 0 ? (
        // 口座が未登録の場合の表示内容
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-zinc-600" />
            <p className="mt-4 text-sm text-zinc-500">
              まだ口座が登録されていません．
            </p>
            <Link href="/accounts/new" className="mt-4">
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                最初の口座を追加
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        // 口座一覧のグリッド表示
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account, idx) => {
            // メイン口座内の総残高を計算する．
            const totalBalance = account.subAccounts.reduce(
              (sum, sa) => sum + sa.balance,
              0,
            );

            return (
              <Link
                key={account.id}
                href={`/accounts/${account.id}`}
                className="group"
              >
                <Card
                  className="h-full kpi-card"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {/* アイコン部分 */}
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800">
                          <Building2 className="h-5 w-5 text-zinc-300" />
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            {account.label}
                          </CardTitle>
                          <p className="text-xs text-zinc-500">
                            {account.provider.name} ·{" "}
                            {account.subAccounts.length} 子口座
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-zinc-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* 合計残高表示 */}
                    <p className="text-2xl font-bold tracking-tight text-zinc-50">
                      {formatCurrency(totalBalance)}
                    </p>

                    {/* 子口座名のバッジ一覧 */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {account.subAccounts.slice(0, 5).map(sa => (
                        <Badge
                          key={sa.id}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          <span
                            className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                            style={{
                              background: assetTypeColor(sa.assetType),
                            }}
                          />
                          {sa.currentName}
                        </Badge>
                      ))}
                      {account.subAccounts.length > 5 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{account.subAccounts.length - 5}
                        </Badge>
                      )}
                    </div>

                    {/* 資産タイプ別の内訳表示 */}
                    <div className="mt-4 space-y-1.5">
                      {(["CASH", "INVESTMENT", "CRYPTO", "POINT"] as const).map(
                        type => {
                          const typeBalance = account.subAccounts
                            .filter(sa => sa.assetType === type)
                            .reduce((s, sa) => s + sa.balance, 0);
                          if (typeBalance === 0) {
                            return null;
                          }
                          return (
                            <div
                              key={type}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{
                                    background: assetTypeColor(type),
                                  }}
                                />
                                <span className="text-zinc-400">
                                  {assetTypeLabel(type)}
                                </span>
                              </span>
                              <span className="font-mono text-zinc-300">
                                {formatCurrency(typeBalance)}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
