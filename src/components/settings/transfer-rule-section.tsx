"use client";

import { Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { getAccounts } from "@/actions/accounts";
import {
  createTransferRule,
  deleteTransferRule,
  type getTransferRules,
} from "@/actions/transactions";
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

type Account = Awaited<ReturnType<typeof getAccounts>>[number];
type TransferRule = Awaited<ReturnType<typeof getTransferRules>>[number];

/**
 * 振替ルールの一覧・追加・削除を行う設定画面のセクションである．
 * 一覧の取得は親の SettingsContent がまとめて行うため，変更後は onChanged で再取得を依頼する．
 */
export function TransferRuleSection({
  accounts,
  transferRules,
  onChanged,
}: {
  accounts: Account[];
  transferRules: TransferRule[];
  onChanged: () => void;
}) {
  const [transferRuleKeyword, setTransferRuleKeyword] = useState("");
  const [transferRuleTargetSubAccountId, setTransferRuleTargetSubAccountId] =
    useState<string>("");

  const handleAddTransferRule = async () => {
    // trim しないと空白のみが検証を通過し，全明細を対象にした
    // 振替ペア検出が無関係な明細を大量にマークする
    const keyword = transferRuleKeyword.trim();
    if (!keyword || !transferRuleTargetSubAccountId) return;
    try {
      await createTransferRule({
        keyword,
        targetSubAccountId: transferRuleTargetSubAccountId,
      });
      toast.success("振替ルールを追加しました．");
      setTransferRuleKeyword("");
      setTransferRuleTargetSubAccountId("");
      onChanged();
    } catch {
      toast.error("振替ルールの追加に失敗しました．");
    }
  };

  const handleDeleteTransferRule = async (id: string) => {
    try {
      await deleteTransferRule(id);
      toast.success("振替ルールを削除しました．");
      onChanged();
    } catch {
      toast.error("振替ルールの削除に失敗しました．");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          振替ルール管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="space-y-2 flex-1 w-full">
            <Label>キーワード</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="明細の摘要に含まれる文字"
                className="pl-8 text-sm"
                value={transferRuleKeyword}
                onChange={e => setTransferRuleKeyword(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 w-full sm:w-auto sm:flex-1 md:w-[250px] shrink-0">
            <Label>振替先口座</Label>
            <Select
              value={transferRuleTargetSubAccountId}
              onValueChange={setTransferRuleTargetSubAccountId}
            >
              <SelectTrigger>
                <SelectValue placeholder="口座を選択" />
              </SelectTrigger>
              <SelectContent>
                {accounts
                  .flatMap(a =>
                    a.subAccounts.map(sa => ({
                      id: sa.id,
                      name: `${a.label}（${sa.currentName}）`,
                    })),
                  )
                  .map(sa => (
                    <SelectItem key={sa.id} value={sa.id}>
                      {sa.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAddTransferRule}
            disabled={
              !transferRuleKeyword.trim() || !transferRuleTargetSubAccountId
            }
            className="w-full md:w-auto"
          >
            ルール追加
          </Button>
        </div>

        <div className="rounded-md border border-zinc-800 overflow-hidden">
          {/* Mobile View */}
          <div className="md:hidden divide-y divide-zinc-800">
            {transferRules.map(rule => (
              <div key={rule.id} className="p-3 bg-card min-w-0">
                <div className="flex justify-between items-start gap-3 min-w-0">
                  <div className="space-y-1.5 min-w-0 overflow-hidden flex-1">
                    <div className="font-mono text-zinc-200 text-sm truncate">
                      {rule.keyword}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {rule.targetSubAccount.mainAccount.label}（
                      {rule.targetSubAccount.currentName}）
                    </Badge>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-zinc-500 hover:text-red-400 shrink-0"
                        aria-label="ルール削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>削除確認</AlertDialogTitle>
                        <AlertDialogDescription>
                          キーワード「{rule.keyword}
                          」の振替ルールを削除しますか？
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteTransferRule(rule.id)}
                          className="bg-red-600"
                        >
                          削除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
            {transferRules.length === 0 && (
              <div className="p-8 text-center text-sm text-zinc-500">
                ルールがありません
              </div>
            )}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">
                    キーワード
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    振替先口座
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferRules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-zinc-300 truncate max-w-[200px]">
                      {rule.keyword}
                    </TableCell>
                    <TableCell>
                      {rule.targetSubAccount.mainAccount.label}（
                      {rule.targetSubAccount.currentName}）
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-500 hover:text-red-400"
                            aria-label="ルール削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>削除確認</AlertDialogTitle>
                            <AlertDialogDescription>
                              キーワード「{rule.keyword}
                              」の振替ルールを削除しますか？
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteTransferRule(rule.id)}
                              className="bg-red-600"
                            >
                              削除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {transferRules.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-zinc-500"
                    >
                      ルールがありません
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
