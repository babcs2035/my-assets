"use client";

import {
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  abortSyncProvider,
  createProvider,
  deleteProvider,
  type getProviders,
  syncProvider,
} from "@/actions/providers";
import { DeleteConfirmDialog } from "@/components/settings/delete-confirm-dialog";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { BACKFILL_START_DATE, formatJSTDateTime } from "@/lib/utils";

type Provider = Awaited<ReturnType<typeof getProviders>>[number];

/**
 * プロバイダーの追加・手動同期・同期の中止・削除を行う設定画面のセクションである．
 * 一覧の取得は親の SettingsContent がまとめて行うため，変更後は onChanged で再取得を依頼する．
 */
export function ProviderSection({
  providers,
  isLoading,
  onChanged,
}: {
  providers: Provider[];
  // 親の一括取得中はカード全体に読み込み中のオーバーレイを重ねる
  isLoading: boolean;
  onChanged: () => void;
}) {
  const [syncingProviderIds, setSyncingProviderIds] = useState<Set<string>>(
    new Set(),
  );
  const [syncDialogProviderId, setSyncDialogProviderId] = useState<
    string | null
  >(null);
  // 同期中かどうかはこのセッションで開始した同期，または
  // 「同期開始済み（lastSyncAt あり）かつ未完了（lastSyncSuccess が null）」で判定する．
  // lastSyncSuccess === null のみでは「未同期」のプロバイダーが永遠に「同期中」になる
  const isProviderSyncing = (provider: Provider) =>
    syncingProviderIds.has(provider.id) ||
    (provider.lastSyncAt !== null && provider.lastSyncSuccess === null);

  // Provider Form State
  const [providerName, setProviderName] = useState("");
  const [providerType, setProviderType] = useState<"mf" | "custom">("mf");
  const [scraperScript, setScraperScript] = useState("");
  const [isCustomProvider, setIsCustomProvider] = useState(false);
  // 追加中のフラグ（ダブルクリックによる二重送信を防ぐ）
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  // カスタムプロバイダー Dialog の開閉状態
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);

  const handleAddProvider = async () => {
    // trim しないと空白のみが zod min(1) を通過し，空白名のプロバイダーが作成される
    const name = providerName.trim();
    if (!name) return;
    setIsAddingProvider(true);
    try {
      await createProvider({
        name,
        type: providerType,
        scraperScript: isCustomProvider ? scraperScript : undefined,
      });
      toast.success("プロバイダーを追加しました．");
      setProviderName("");
      setScraperScript("");
      setIsCustomProvider(false);
      // 非制御 Dialog では成功後も開いたままになるため，明示的に閉じる
      setProviderDialogOpen(false);
      onChanged();
    } catch {
      toast.error("プロバイダーの追加に失敗しました．");
    } finally {
      setIsAddingProvider(false);
    }
  };

  const handleDeleteProvider = async (id: string, name: string) => {
    try {
      await deleteProvider(id);
      toast.success(`プロバイダー「${name}」を削除しました．`);
      onChanged();
    } catch {
      toast.error("プロバイダーの削除に失敗しました．");
    }
  };

  const handleSyncProvider = async (id: string) => {
    setSyncDialogProviderId(null);
    toast.info("同期を開始しました．");
    window.dispatchEvent(
      new CustomEvent("provider-sync-status", {
        detail: { providerId: id, status: "syncing" },
      }),
    );
    setSyncingProviderIds(prev => new Set(prev).add(id));
    try {
      await syncProvider(id);
      window.dispatchEvent(
        new CustomEvent("provider-sync-status", {
          detail: { providerId: id, status: "success" },
        }),
      );
      toast.success("同期が完了しました．");
      onChanged();
    } catch (err) {
      // 中止の場合は handleAbortSyncProvider が既に通知・イベントを
      // 送出しているため，ここで重複トーストを出さない
      const isAbort =
        err instanceof Error && err.message === "Sync was aborted";
      if (!isAbort) {
        window.dispatchEvent(
          new CustomEvent("provider-sync-status", {
            detail: { providerId: id, status: "error" },
          }),
        );
        toast.error("同期に失敗しました．");
      }
      onChanged();
    } finally {
      setSyncingProviderIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleAbortSyncProvider = async (id: string) => {
    toast.info("同期を中止しています...");
    try {
      await abortSyncProvider(id);
      // 中止は失敗とは区別して通知する（SyncStatus が赤い失敗表示にならないよう）
      window.dispatchEvent(
        new CustomEvent("provider-sync-status", {
          detail: { providerId: id, status: "aborted" },
        }),
      );
      toast.success("同期を中止しました．");
      onChanged();
    } catch {
      toast.error("同期の中止に失敗しました．");
    } finally {
      setSyncingProviderIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <Card className="relative">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          プロバイダー設定
        </CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-4">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                読み込み中...
              </span>
            </div>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="provider-name">プロバイダー名</Label>
            <Input
              id="provider-name"
              placeholder="例: 三井住友銀行"
              value={providerName}
              onChange={e => setProviderName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-type">タイプ</Label>
            <Select
              value={providerType}
              onValueChange={v => {
                setProviderType(v as "mf" | "custom");
                setIsCustomProvider(v === "custom");
              }}
            >
              <SelectTrigger id="provider-type">
                <SelectValue placeholder="種類を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mf">MoneyForward</SelectItem>
                <SelectItem value="custom">カスタム</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            {isCustomProvider ? (
              <Dialog
                open={providerDialogOpen}
                onOpenChange={setProviderDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button className="w-full" disabled={!providerName.trim()}>
                    <Plus className="mr-2 h-4 w-4" />
                    追加
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>スクレーパースクリプトの設定</DialogTitle>
                    <DialogDescription>
                      Playwrightを使用したスクレーピングスクリプトを入力してください．
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="provider-script">
                        スクリプト (TypeScript)
                      </Label>
                      <Textarea
                        id="provider-script"
                        className="font-mono text-xs min-h-[300px]"
                        placeholder="// Playwright script..."
                        value={scraperScript}
                        onChange={e => setScraperScript(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleAddProvider}
                      loading={isAddingProvider}
                      disabled={!providerName.trim()}
                    >
                      保存して追加
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Button
                className="w-full"
                disabled={!providerName.trim()}
                onClick={handleAddProvider}
                loading={isAddingProvider}
              >
                <Plus className="mr-2 h-4 w-4" />
                追加
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-md border border-zinc-800 overflow-hidden">
          {/* Mobile View */}
          <div className="md:hidden divide-y divide-zinc-800">
            {providers.map(provider => (
              <div key={provider.id} className="p-4 bg-card min-w-0">
                {(() => {
                  const isSyncing = isProviderSyncing(provider);
                  return (
                    <>
                      <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                        <span className="font-medium text-zinc-200 truncate flex-1">
                          {provider.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            isSyncing
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20 shrink-0"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0"
                          }
                        >
                          {isSyncing ? "同期中" : "稼働中"}
                        </Badge>
                      </div>
                      <div className="text-sm text-zinc-400 mb-1 truncate">
                        {getProviderTypeLabel(provider.type)}
                      </div>
                      <div className="text-xs text-zinc-500 mb-3 truncate">
                        {isSyncing ? (
                          <span className="flex items-center gap-1 text-blue-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            同期中
                          </span>
                        ) : provider.lastSyncAt ? (
                          <span
                            className={`flex items-center gap-1 ${provider.lastSyncSuccess ? "text-emerald-500" : "text-red-400"}`}
                          >
                            {provider.lastSyncSuccess ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {formatJSTDateTime(provider.lastSyncAt)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Minus className="h-3 w-3" />
                            未同期
                          </span>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        {isSyncing ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAbortSyncProvider(provider.id)}
                            className="h-8 text-red-400 hover:text-red-300"
                          >
                            <Square className="mr-2 h-3.5 w-3.5" />
                            中止
                          </Button>
                        ) : (
                          <Dialog
                            open={syncDialogProviderId === provider.id}
                            onOpenChange={open => {
                              if (open) {
                                setSyncDialogProviderId(provider.id);
                              } else {
                                setSyncDialogProviderId(null);
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-blue-400"
                              >
                                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                                同期
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>手動同期の実行</DialogTitle>
                                <DialogDescription>
                                  手動同期では {BACKFILL_START_DATE}
                                  まで遡って，入出金明細と残高推移を全件取得します．
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button
                                  onClick={() =>
                                    handleSyncProvider(provider.id)
                                  }
                                >
                                  実行
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                        <DeleteConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              削除
                            </Button>
                          }
                          onConfirm={() =>
                            handleDeleteProvider(provider.id, provider.name)
                          }
                        >
                          プロバイダー「{provider.name}
                          」を削除しますか？
                          関連する口座データも削除される可能性があります．
                        </DeleteConfirmDialog>
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
            {providers.length === 0 && (
              <div className="p-8 text-center text-zinc-500">
                プロバイダーがありません
              </div>
            )}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">名前</TableHead>
                  <TableHead className="whitespace-nowrap">タイプ</TableHead>
                  <TableHead className="whitespace-nowrap">最終同期</TableHead>
                  <TableHead className="whitespace-nowrap">
                    ステータス
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map(provider => (
                  <TableRow key={provider.id}>
                    <TableCell className="font-medium text-zinc-200">
                      {provider.name}
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {getProviderTypeLabel(provider.type)}
                    </TableCell>
                    <TableCell className="text-zinc-400 text-xs whitespace-nowrap">
                      {formatJSTDateTime(provider.lastSyncAt)}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        if (isProviderSyncing(provider)) {
                          return (
                            <Badge
                              variant="outline"
                              className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs"
                            >
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              同期中
                            </Badge>
                          );
                        }
                        if (provider.lastSyncSuccess === true) {
                          return (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs"
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              成功
                            </Badge>
                          );
                        }
                        if (provider.lastSyncSuccess === false) {
                          return (
                            <Badge
                              variant="outline"
                              className="bg-red-500/10 text-red-400 border-red-500/20 text-xs"
                            >
                              <XCircle className="mr-1 h-3 w-3" />
                              失敗
                            </Badge>
                          );
                        }
                        return <span className="text-xs text-zinc-500">—</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(() => {
                          if (isProviderSyncing(provider)) {
                            return (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleAbortSyncProvider(provider.id)
                                }
                                title="中止"
                                aria-label={`プロバイダー「${provider.name}」の同期を中止`}
                                className="text-red-400 hover:text-red-300"
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            );
                          }
                          // モバイル用の Dialog と state を共有すると，CSS で隠れている側も
                          // portal で同時に開くため，state を持たない AlertDialog にする
                          return (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="同期"
                                  aria-label={`プロバイダー「${provider.name}」を同期`}
                                >
                                  <RefreshCw className="h-4 w-4 text-blue-400" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    手動同期の実行
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    手動同期では {BACKFILL_START_DATE}
                                    まで遡って，入出金明細と残高推移を全件取得します．
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    キャンセル
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleSyncProvider(provider.id)
                                    }
                                  >
                                    実行
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          );
                        })()}
                        <DeleteConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-zinc-400 hover:text-red-400"
                              aria-label={`プロバイダー「${provider.name}」を削除`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          onConfirm={() =>
                            handleDeleteProvider(provider.id, provider.name)
                          }
                        >
                          プロバイダー「{provider.name}
                          」を削除しますか？
                          関連する口座データも削除される可能性があります．
                        </DeleteConfirmDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {providers.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-zinc-500"
                    >
                      プロバイダーがありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
