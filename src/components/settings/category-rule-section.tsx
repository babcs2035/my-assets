"use client";

import { Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createCategoryRule,
  deleteCategoryRule,
  type getCategories,
  type getCategoryRules,
} from "@/actions/categories";
import { CategoryTypeIcon } from "@/components/settings/category-type-icon";
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

type Category = Awaited<ReturnType<typeof getCategories>>[number];
type CategoryRule = Awaited<ReturnType<typeof getCategoryRules>>[number];

/**
 * 自動仕訳ルールの一覧・追加・削除を行う設定画面のセクションである．
 * 一覧の取得は親の SettingsContent がまとめて行うため，変更後は onChanged で再取得を依頼する．
 */
export function CategoryRuleSection({
  categories,
  rules,
  onChanged,
}: {
  categories: Category[];
  rules: CategoryRule[];
  onChanged: () => void;
}) {
  const [ruleKeywords, setRuleKeywords] = useState("");
  const [ruleSubCategoryId, setRuleSubCategoryId] = useState<string>("");

  const handleAddRule = async () => {
    // trim しないと空白のみが検証を通過し，Prisma の contains 検索で
    // ほぼ全明細にマッチして大量の誤分類が発生する
    const keyword = ruleKeywords.trim();
    if (!keyword || !ruleSubCategoryId) return;
    try {
      await createCategoryRule({
        keyword,
        subCategoryId: ruleSubCategoryId,
        priority: 0,
      });
      toast.success("ルールを追加しました．");
      setRuleKeywords("");
      setRuleSubCategoryId("");
      onChanged();
    } catch {
      toast.error("ルールの追加に失敗しました．");
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await deleteCategoryRule(id);
      toast.success("ルールを削除しました．");
      onChanged();
    } catch {
      toast.error("ルールの削除に失敗しました．");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          ルール管理
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
                value={ruleKeywords}
                onChange={e => setRuleKeywords(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 w-full sm:w-auto sm:flex-1 md:w-[250px] shrink-0">
            <Label>適用カテゴリー</Label>
            <Select
              value={ruleSubCategoryId}
              onValueChange={setRuleSubCategoryId}
            >
              <SelectTrigger>
                <SelectValue placeholder="カテゴリーを選択" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(mc =>
                  mc.subCategories.map(sc => (
                    <SelectItem key={sc.id} value={sc.id}>
                      <span className="flex items-center gap-1">
                        <CategoryTypeIcon type={mc.type} className="h-3 w-3" />
                        {mc.name} / {sc.name}
                      </span>
                    </SelectItem>
                  )),
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAddRule}
            disabled={!ruleKeywords.trim() || !ruleSubCategoryId}
            className="w-full md:w-auto"
          >
            ルール追加
          </Button>
        </div>

        <div className="rounded-md border border-zinc-800 overflow-hidden">
          {/* Mobile View */}
          <div className="md:hidden divide-y divide-zinc-800">
            {rules.map(rule => (
              <div key={rule.id} className="p-3 bg-card min-w-0">
                <div className="flex justify-between items-start gap-3 min-w-0">
                  <div className="space-y-1.5 min-w-0 overflow-hidden flex-1">
                    <div className="font-mono text-zinc-200 text-sm truncate">
                      {rule.keyword}
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-xs truncate max-w-full"
                    >
                      {rule.subCategory.mainCategory.name} /{" "}
                      {rule.subCategory.name}
                    </Badge>
                  </div>
                  <DeleteConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-zinc-500 hover:text-red-400 shrink-0"
                        aria-label="ルール削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                    onConfirm={() => handleDeleteRule(rule.id)}
                  >
                    キーワード「{rule.keyword}
                    」の自動分類ルールを削除しますか？
                  </DeleteConfirmDialog>
                </div>
              </div>
            ))}
            {rules.length === 0 && (
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
                    適用カテゴリー
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-zinc-300 truncate max-w-[200px]">
                      {rule.keyword}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {rule.subCategory.mainCategory.name} /{" "}
                        {rule.subCategory.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-500 hover:text-red-400"
                            aria-label="ルール削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        onConfirm={() => handleDeleteRule(rule.id)}
                      >
                        キーワード「{rule.keyword}
                        」の自動分類ルールを削除しますか？
                      </DeleteConfirmDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && (
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
