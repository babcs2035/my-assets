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
import { DeleteConfirmDialog } from "@/components/settings/delete-confirm-dialog";
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
  const [isAddingTransferRule, setIsAddingTransferRule] = useState(false);

  const handleAddTransferRule = async () => {
    // trim しないと空白のみが検証を通過し，全明細を対象にした
    // 振替ペア検出が無関係な明細を大量にマークする
    const keyword = transferRuleKeyword.trim();
    // 応答までボタンが押せたままだと，連打で同じ振替ルールが重複して作られる (SET-10)
    if (!keyword || !transferRuleTargetSubAccountId || isAddingTransferRule) {
      return;
    }
    setIsAddingTransferRule(true);
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
    } finally {
      setIsAddingTransferRule(false);
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
            <Label htmlFor="transfer-rule-keyword">キーワード</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                id="transfer-rule-keyword"
                placeholder="明細の摘要に含まれる文字"
                className="pl-8 text-sm"
                value={transferRuleKeyword}
                onChange={e => setTransferRuleKeyword(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 w-full sm:w-auto sm:flex-1 md:w-[250px] shrink-0">
            <Label htmlFor="transfer-rule-target">振替先口座</Label>
            <Select
              value={transferRuleTargetSubAccountId}
              onValueChange={setTransferRuleTargetSubAccountId}
            >
              <SelectTrigger id="transfer-rule-target">
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
              !transferRuleKeyword.trim() ||
              !transferRuleTargetSubAccountId ||
              isAddingTransferRule
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
                  <DeleteConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-zinc-500 hover:text-red-400 shrink-0"
                        // 全行が同じ名前だと，読み上げでどのルールを消すボタンか区別できない (SET-13)
                        aria-label={`キーワード「${rule.keyword}」の振替ルールを削除`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                    onConfirm={() => handleDeleteTransferRule(rule.id)}
                  >
                    キーワード「{rule.keyword}
                    」の振替ルールを削除しますか？
                  </DeleteConfirmDialog>
                </div>
              </div>
            ))}
            {transferRules.length === 0 && (
              <div className="p-8 text-center text-sm text-zinc-400">
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
                      <DeleteConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-500 hover:text-red-400"
                            aria-label={`キーワード「${rule.keyword}」の振替ルールを削除`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        onConfirm={() => handleDeleteTransferRule(rule.id)}
                      >
                        キーワード「{rule.keyword}
                        」の振替ルールを削除しますか？
                      </DeleteConfirmDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {transferRules.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-zinc-400"
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
