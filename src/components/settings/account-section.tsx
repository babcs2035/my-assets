"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createMainAccount,
  deleteMainAccount,
  type getAccounts,
  updateMainAccount,
} from "@/actions/accounts";
import type { getProviders } from "@/actions/providers";
import { getProviderTypeLabel } from "@/components/settings/provider-type-label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assetTypeColor } from "@/lib/utils";

type Provider = Awaited<ReturnType<typeof getProviders>>[number];
type Account = Awaited<ReturnType<typeof getAccounts>>[number];

/**
 * 保有口座の一覧・追加・プロバイダーの付け替え・削除を行う設定画面のセクションである．
 * 一覧の取得は親の SettingsContent がまとめて行うため，変更後は onChanged で再取得を依頼する．
 */
export function AccountSection({
  accounts,
  providers,
  onChanged,
}: {
  accounts: Account[];
  providers: Provider[];
  onChanged: () => void;
}) {
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountProviderId, setNewAccountProviderId] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const handleDeleteAccount = async (id: string, name: string) => {
    try {
      await deleteMainAccount(id);
      toast.success(`口座「${name}」を削除しました．`);
      onChanged();
    } catch {
      toast.error("口座の削除に失敗しました．");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          保有口座管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Account Creation Form */}
        <div className="rounded-md border border-zinc-800 bg-zinc-900/20 p-4 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">口座の追加</h2>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[160px]">
              <Label
                htmlFor="new-account-provider"
                className="text-xs text-zinc-400"
              >
                プロバイダー
              </Label>
              <Select
                value={newAccountProviderId}
                onValueChange={setNewAccountProviderId}
              >
                <SelectTrigger id="new-account-provider" className="h-8">
                  <SelectValue placeholder="プロバイダーを選択" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label
                htmlFor="new-account-label"
                className="text-xs text-zinc-400"
              >
                金融機関名
              </Label>
              <Input
                id="new-account-label"
                placeholder="例: 住信SBIネット銀行"
                value={newAccountLabel}
                onChange={e => setNewAccountLabel(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={async () => {
                  // trim しないと空白のみが zod min(1) を通過し，空白名の口座が作成される
                  const label = newAccountLabel.trim();
                  if (!newAccountProviderId || !label) return;
                  setIsCreatingAccount(true);
                  try {
                    await createMainAccount({
                      label,
                      providerId: newAccountProviderId,
                    });
                    toast.success("口座を作成しました");
                    setNewAccountLabel("");
                    setNewAccountProviderId("");
                    onChanged();
                  } catch {
                    toast.error("口座の作成に失敗しました");
                  } finally {
                    setIsCreatingAccount(false);
                  }
                }}
                disabled={
                  !newAccountProviderId ||
                  !newAccountLabel.trim() ||
                  isCreatingAccount
                }
              >
                {isCreatingAccount ? "作成中..." : "追加"}
              </Button>
            </div>
          </div>
        </div>

        {/* Account List by Provider */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-400">口座一覧</h2>
          {providers.map(provider => {
            const providerAccounts = accounts.filter(
              a => a.providerId === provider.id,
            );
            return (
              <div
                key={provider.id}
                className="rounded-md border border-zinc-800 bg-zinc-900/20"
              >
                <div className="flex items-center justify-between p-3 bg-zinc-900/50 border-b border-zinc-800 min-w-0">
                  <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                    <span className="font-semibold text-sm text-zinc-200 truncate">
                      {provider.name}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs h-5 px-1.5 text-zinc-500 border-zinc-700 shrink-0"
                    >
                      {getProviderTypeLabel(provider.type)}
                    </Badge>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {providerAccounts.length} 口座
                  </Badge>
                </div>

                <div className="p-0 border-t border-zinc-800">
                  {providerAccounts.length > 0 ? (
                    <>
                      {/* Mobile View */}
                      <div className="md:hidden divide-y divide-zinc-800">
                        {providerAccounts.map(ac => (
                          <div key={ac.id} className="p-4 min-w-0">
                            <div className="flex justify-between items-start gap-2 mb-2 min-w-0">
                              <div className="font-medium text-sm text-zinc-200 truncate flex-1">
                                {ac.label}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Select
                                  value={ac.providerId}
                                  onValueChange={async newId => {
                                    try {
                                      await updateMainAccount(ac.id, {
                                        providerId: newId,
                                      });
                                      toast.success(
                                        "プロバイダーを更新しました",
                                      );
                                      onChanged();
                                    } catch {
                                      toast.error(
                                        "プロバイダーの更新に失敗しました",
                                      );
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {providers.map(p => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-zinc-400 hover:text-red-400"
                                      aria-label={`口座「${ac.label}」を削除`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        削除確認
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        口座「{ac.label}
                                        」を削除しますか？関連する明細履歴もすべて削除されます．
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        キャンセル
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() =>
                                          handleDeleteAccount(ac.id, ac.label)
                                        }
                                        className="bg-red-600"
                                      >
                                        削除
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {ac.subAccounts.map(sub => (
                                <Badge
                                  key={sub.id}
                                  variant="secondary"
                                  className="text-[10px] max-w-[120px] truncate px-1.5 py-0"
                                  style={{
                                    background: `${assetTypeColor(sub.assetType)}20`,
                                    borderColor: assetTypeColor(sub.assetType),
                                    color: assetTypeColor(sub.assetType),
                                  }}
                                >
                                  {sub.currentName}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop View */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table className="min-w-[500px]">
                          <TableHeader>
                            <TableRow className="hover:bg-transparent border-zinc-800">
                              <TableHead className="h-8 text-xs whitespace-nowrap">
                                金融機関
                              </TableHead>
                              <TableHead className="h-8 text-xs whitespace-nowrap">
                                内訳・詳細
                              </TableHead>
                              <TableHead className="h-8 text-xs text-right whitespace-nowrap">
                                操作
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {providerAccounts.map(ac => (
                              <TableRow
                                key={ac.id}
                                className="border-0 hover:bg-zinc-800/30"
                              >
                                <TableCell className="py-2 text-sm whitespace-nowrap">
                                  {ac.label}
                                </TableCell>
                                <TableCell className="py-2 text-sm text-zinc-500">
                                  <div className="flex flex-wrap gap-1.5">
                                    {ac.subAccounts.map(sub => (
                                      <Badge
                                        key={sub.id}
                                        variant="secondary"
                                        className="text-[10px] max-w-[140px] truncate px-1.5 py-0"
                                        style={{
                                          background: `${assetTypeColor(sub.assetType)}20`,
                                          borderColor: assetTypeColor(
                                            sub.assetType,
                                          ),
                                          color: assetTypeColor(sub.assetType),
                                        }}
                                      >
                                        {sub.currentName}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right whitespace-nowrap">
                                  <div className="flex justify-end items-center gap-2">
                                    <Select
                                      value={ac.providerId}
                                      onValueChange={async newId => {
                                        try {
                                          await updateMainAccount(ac.id, {
                                            providerId: newId,
                                          });
                                          toast.success(
                                            "プロバイダーを更新しました",
                                          );
                                          onChanged();
                                        } catch {
                                          toast.error(
                                            "プロバイダーの更新に失敗しました",
                                          );
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-8 w-28">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {providers.map(p => (
                                          <SelectItem key={p.id} value={p.id}>
                                            {p.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-zinc-400 hover:text-red-400"
                                          aria-label={`口座「${ac.label}」を削除`}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>
                                            削除確認
                                          </AlertDialogTitle>
                                          <AlertDialogDescription>
                                            口座「{ac.label}
                                            」を削除しますか？関連する明細履歴もすべて削除されます．
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>
                                            キャンセル
                                          </AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() =>
                                              handleDeleteAccount(
                                                ac.id,
                                                ac.label,
                                              )
                                            }
                                            className="bg-red-600"
                                          >
                                            削除
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-xs text-zinc-500">
                      このサービスに関連付けられた口座はありません
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {providers.length === 0 && (
            <div className="text-center text-zinc-500 py-4">
              プロバイダーがありません
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
