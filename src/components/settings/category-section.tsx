"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  Edit2,
  GripVertical,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createMainCategory,
  createSubCategory,
  deleteMainCategory,
  deleteSubCategory,
  exportCategories,
  type getCategories,
  importCategories,
  reorderMainCategories,
  reorderSubCategories,
  updateMainCategory,
  updateSubCategory,
} from "@/actions/categories";
import { CategoryTypeIcon } from "@/components/settings/category-type-icon";
import { DeleteConfirmDialog } from "@/components/settings/delete-confirm-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
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
import { formatJSTDate } from "@/lib/utils";

type Category = Awaited<ReturnType<typeof getCategories>>[number];

/**
 * メイン・サブカテゴリーの追加・名前の変更・削除・並べ替えと，エクスポート・インポートを行う設定画面のセクションである．
 * 一覧の取得は親の SettingsContent がまとめて行うため，変更後は onChanged で再取得を依頼する．
 */
export function CategorySection({
  categories,
  onChanged,
}: {
  categories: Category[];
  onChanged: () => void;
}) {
  // ドラッグ中に並べ替えた順序はドロップで保存するまでこの state に持つ．
  // 親が再取得して categories が変わったら描画中に作り直す
  // （useEffect で作り直すと，古い順序のまま 1 回余分に描画される）
  const [prevCategories, setPrevCategories] = useState(categories);
  const [expenseCategoryItems, setExpenseCategoryItems] = useState(() =>
    categories.filter(cat => cat.type === "EXPENSE"),
  );
  const [incomeCategoryItems, setIncomeCategoryItems] = useState(() =>
    categories.filter(cat => cat.type === "INCOME"),
  );
  if (categories !== prevCategories) {
    setPrevCategories(categories);
    setExpenseCategoryItems(categories.filter(cat => cat.type === "EXPENSE"));
    setIncomeCategoryItems(categories.filter(cat => cat.type === "INCOME"));
  }
  const [, startTransition] = useTransition();

  // Category Form State
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<string>("EXPENSE");
  // 追加中のフラグ（ダブルクリックによる二重作成を防ぐ）
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [selectedMainCategory, setSelectedMainCategory] = useState<
    string | null
  >(null);
  const [newSubCategoryName, setNewSubCategoryName] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [draggedMainIndex, setDraggedMainIndex] = useState<number | null>(null);
  const [draggedMainType, setDraggedMainType] = useState<
    "INCOME" | "EXPENSE" | null
  >(null);
  const [draggedSubContext, setDraggedSubContext] = useState<{
    mainCategoryId: string;
    index: number;
  } | null>(null);

  // ドラッグ中のハンドラが stale な state を参照しないよう、
  // 常に最新の state 値を参照するための ref である．
  const expenseCategoryItemsRef = useRef<Category[]>([]);
  const incomeCategoryItemsRef = useRef<Category[]>([]);

  // Category Edit State
  const [editingMainCategory, setEditingMainCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editingSubCategory, setEditingSubCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Category Import State
  const [isImporting, setIsImporting] = useState(false);
  // インポート対象ファイル（確認ダイアログで承認されるまで保持する．
  // インポートは既存カテゴリー・ルールの全削除という破壊的操作のため）
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  // state 変更時に ref を最新に保つ（ドラッグハンドラが常に最新データを参照するため）
  useEffect(() => {
    expenseCategoryItemsRef.current = expenseCategoryItems;
  }, [expenseCategoryItems]);
  useEffect(() => {
    incomeCategoryItemsRef.current = incomeCategoryItems;
  }, [incomeCategoryItems]);

  // --- ハンドラ関数群 ---

  const handleAddMainCategory = async () => {
    // trim しないと空白のみが zod min(1) を通過し，空白名のカテゴリーが作成される
    const name = newCategoryName.trim();
    if (!name || isAddingCategory) return;
    setIsAddingCategory(true);
    try {
      await createMainCategory({
        name,
        type: newCategoryType as "INCOME" | "EXPENSE",
      });
      toast.success("カテゴリーを追加しました．");
      setNewCategoryName("");
      onChanged();
    } catch {
      toast.error("カテゴリーの追加に失敗しました．");
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleDeleteMainCategory = async (id: string) => {
    try {
      await deleteMainCategory(id);
      toast.success("カテゴリーを削除しました．");
      onChanged();
    } catch {
      toast.error("カテゴリーの削除に失敗しました．");
    }
  };

  const handleUpdateMainCategory = async (id: string, name: string) => {
    // trim して空の場合は更新しない（zod min(1) は空白のみを通過させるため）
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("カテゴリー名は空にできません．");
      return;
    }
    try {
      await updateMainCategory(id, { name: trimmed });
      toast.success("カテゴリー名を更新しました．");
      setEditingMainCategory(null);
      onChanged();
    } catch {
      // server action の ZodError の message は issues の JSON 文字列になるため，
      // ユーザーには共通の表現で通知する（内部状態を推測させない）
      toast.error("カテゴリー名の更新に失敗しました．");
    }
  };

  const handleDeleteSubCategory = async (id: string) => {
    try {
      await deleteSubCategory(id);
      toast.success("サブカテゴリーを削除しました．");
      onChanged();
    } catch {
      toast.error("サブカテゴリーの削除に失敗しました．");
    }
  };

  const handleUpdateSubCategory = async (id: string, name: string) => {
    // trim して空の場合は更新しない（zod min(1) は空白のみを通過させるため）
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("サブカテゴリー名は空にできません．");
      return;
    }
    try {
      await updateSubCategory(id, { name: trimmed });
      toast.success("サブカテゴリー名を更新しました．");
      setEditingSubCategory(null);
      onChanged();
    } catch {
      // server action の ZodError の message は issues の JSON 文字列になるため，
      // ユーザーには共通の表現で通知する（内部状態を推測させない）
      toast.error("サブカテゴリー名の更新に失敗しました．");
    }
  };

  const handleExportCategories = async () => {
    try {
      const data = await exportCategories();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // ファイル名の日付は JST 基準にする（toISOString は UTC ため
      // JST 深夜帯に前日付になる）
      a.download = `categories-export-${formatJSTDate(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("エクスポートしました．");
    } catch {
      toast.error("エクスポートに失敗しました．");
    }
  };

  const handleImportCategories = async (file: File) => {
    setPendingImportFile(null);
    setIsImporting(true);
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        // SyntaxError の原文はユーザーにとって意味がないため，
        // 共通の表現にまとめる
        toast.error(
          "ファイルが不正な形式です．JSON ファイルを選択してください．",
        );
        return;
      }
      await importCategories(data);
      toast.success("インポートしました．");
      onChanged();
    } catch {
      // server action の ZodError の message は issues の JSON 文字列になるため，
      // ユーザーには共通の表現で通知する（内部状態を推測させない）
      toast.error(
        "インポートに失敗しました．ファイルの内容を確認してください．",
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddSubCategory = async () => {
    // trim しないと空白のみが zod min(1) を通過し，空白名のカテゴリーが作成される
    const name = newSubCategoryName.trim();
    if (!selectedMainCategory || !name) return;
    try {
      await createSubCategory({
        mainCategoryId: selectedMainCategory,
        name,
      });
      toast.success("サブカテゴリーを追加しました．");
      setNewSubCategoryName("");
      setExpandedCategories(prev => new Set(prev).add(selectedMainCategory));
      onChanged();
    } catch {
      toast.error("サブカテゴリーの追加に失敗しました．");
    }
  };

  const toggleCategory = (id: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  const handleMainDragStart = (
    e: React.DragEvent,
    type: "INCOME" | "EXPENSE",
    index: number,
  ) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedMainType(type);
    setDraggedMainIndex(index);
  };

  const handleMainDragOver = (
    e: React.DragEvent,
    type: "INCOME" | "EXPENSE",
    index: number,
  ) => {
    e.preventDefault();
    if (
      draggedMainType !== type ||
      draggedMainIndex === null ||
      draggedMainIndex === index
    ) {
      return;
    }

    const source =
      type === "EXPENSE" ? [...expenseCategoryItems] : [...incomeCategoryItems];
    const [dragged] = source.splice(draggedMainIndex, 1);
    source.splice(index, 0, dragged);

    if (type === "EXPENSE") {
      setExpenseCategoryItems(source);
    } else {
      setIncomeCategoryItems(source);
    }
    setDraggedMainIndex(index);
  };

  const handleMainDragEnd = () => {
    if (draggedMainType === null || draggedMainIndex === null) return;

    const currentType = draggedMainType;
    const targetItems =
      currentType === "EXPENSE" ? expenseCategoryItems : incomeCategoryItems;
    const orderedIds = targetItems.map(item => item.id);

    setDraggedMainType(null);
    setDraggedMainIndex(null);

    startTransition(async () => {
      try {
        await reorderMainCategories(currentType, orderedIds);
        toast.success("並び順を更新しました．");
      } catch {
        toast.error("カテゴリーの並べ替えに失敗しました．");
      } finally {
        // 成功時は保存結果を，失敗時は DB に残っている元の順序を画面に反映する
        onChanged();
      }
    });
  };

  const handleSubDragStart = (
    e: React.DragEvent,
    mainCategoryId: string,
    index: number,
  ) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedSubContext({ mainCategoryId, index });
  };

  const handleSubDragOver = (
    e: React.DragEvent,
    parentType: "INCOME" | "EXPENSE",
    mainCategoryId: string,
    index: number,
  ) => {
    e.preventDefault();
    if (
      !draggedSubContext ||
      draggedSubContext.mainCategoryId !== mainCategoryId ||
      draggedSubContext.index === index
    ) {
      return;
    }

    const items =
      parentType === "EXPENSE"
        ? [...expenseCategoryItemsRef.current]
        : [...incomeCategoryItemsRef.current];
    const parentIndex = items.findIndex(item => item.id === mainCategoryId);
    if (parentIndex < 0) return;

    const subItems = [...items[parentIndex].subCategories];
    const [dragged] = subItems.splice(draggedSubContext.index, 1);
    subItems.splice(index, 0, dragged);
    items[parentIndex] = { ...items[parentIndex], subCategories: subItems };

    if (parentType === "EXPENSE") {
      setExpenseCategoryItems(items);
    } else {
      setIncomeCategoryItems(items);
    }
    setDraggedSubContext({ mainCategoryId, index });
  };

  const handleSubDragEnd = (parentType: "INCOME" | "EXPENSE") => {
    if (!draggedSubContext) return;
    const { mainCategoryId } = draggedSubContext;

    const items =
      parentType === "EXPENSE" ? expenseCategoryItems : incomeCategoryItems;
    const parent = items.find(item => item.id === mainCategoryId);
    const orderedIds = parent?.subCategories.map(sc => sc.id) ?? [];

    setDraggedSubContext(null);
    if (orderedIds.length === 0) return;

    startTransition(async () => {
      try {
        await reorderSubCategories(mainCategoryId, orderedIds);
        toast.success("並び順を更新しました．");
      } catch {
        toast.error("サブカテゴリーの並べ替えに失敗しました．");
      } finally {
        // 成功時は保存結果を，失敗時は DB に残っている元の順序を画面に反映する
        onChanged();
      }
    });
  };

  // --- カテゴリーを収入・支出に分類する ---
  const expenseCategories = expenseCategoryItems;
  const incomeCategories = incomeCategoryItems;

  /**
   * カテゴリー一覧のレンダリングヘルパー
   */
  const renderCategoryList = (cats: Category[], type: "INCOME" | "EXPENSE") => (
    <div className="space-y-1">
      {cats.map((mc, index) => (
        <Collapsible
          key={mc.id}
          open={expandedCategories.has(mc.id)}
          onOpenChange={() => toggleCategory(mc.id)}
          className="w-full"
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop requires these handlers */}
          <div
            draggable
            onDragStart={e => handleMainDragStart(e, type, index)}
            onDragOver={e => handleMainDragOver(e, type, index)}
            onDragEnd={handleMainDragEnd}
            className={`flex w-full items-center justify-between rounded-md px-2 py-2 hover:bg-zinc-800/50 cursor-grab active:cursor-grabbing transition-opacity ${
              draggedMainType === type && draggedMainIndex === index
                ? "opacity-50 scale-[0.98]"
                : ""
            }`}
          >
            <div className="flex flex-1 items-center gap-2 min-w-0 mr-2">
              {/* ドラッグハンドル（HTML5 DnD はタッチ非対応のためモバイルでは非表示） */}
              <GripVertical className="hidden h-4 w-4 shrink-0 text-zinc-400 md:block" />
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 hover:bg-transparent min-w-0"
                >
                  {expandedCategories.has(mc.id) ? (
                    <ChevronDown className="mr-2 h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronRight className="mr-2 h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  )}
                  <span className="text-sm font-medium text-zinc-200 truncate">
                    {mc.name}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <Badge variant="secondary" className="text-xs shrink-0">
                {mc.subCategories.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Dialog
                open={editingMainCategory?.id === mc.id}
                onOpenChange={open => {
                  if (!open) setEditingMainCategory(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-blue-400"
                    aria-label={`カテゴリー「${mc.name}」を編集`}
                    onClick={() =>
                      setEditingMainCategory({ id: mc.id, name: mc.name })
                    }
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>メインカテゴリー名の変更</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Label htmlFor="edit-main-category-name">
                      カテゴリー名
                    </Label>
                    <Input
                      id="edit-main-category-name"
                      defaultValue={mc.name}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          const input = e.currentTarget;
                          handleUpdateMainCategory(mc.id, input.value);
                        }
                      }}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setEditingMainCategory(null)}
                    >
                      キャンセル
                    </Button>
                    <Button
                      onClick={() => {
                        const input = document.getElementById(
                          "edit-main-category-name",
                        ) as HTMLInputElement;
                        if (input) handleUpdateMainCategory(mc.id, input.value);
                      }}
                    >
                      変更
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <DeleteConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-red-400"
                    aria-label={`カテゴリー「${mc.name}」を削除`}
                    onClick={e => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
                onConfirm={() => handleDeleteMainCategory(mc.id)}
              >
                メインカテゴリー「{mc.name}
                」を削除します．サブカテゴリーがある場合は削除できません．
              </DeleteConfirmDialog>
            </div>
          </div>
          <CollapsibleContent>
            <div className="ml-6 space-y-0.5 border-l border-zinc-800 pl-3">
              {mc.subCategories.map((sc, scIndex) => (
                // biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop requires these handlers
                <div
                  key={sc.id}
                  draggable
                  onDragStart={e => handleSubDragStart(e, mc.id, scIndex)}
                  onDragOver={e => handleSubDragOver(e, type, mc.id, scIndex)}
                  onDragEnd={() => handleSubDragEnd(type)}
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-800/30 cursor-grab active:cursor-grabbing transition-opacity ${
                    draggedSubContext?.mainCategoryId === mc.id &&
                    draggedSubContext?.index === scIndex
                      ? "opacity-50 scale-[0.98]"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                    <GripVertical className="hidden h-3 w-3 shrink-0 text-zinc-400 md:block" />
                    <span className="text-sm text-zinc-300 truncate">
                      {sc.name}
                    </span>
                    <span className="text-xs text-zinc-400 shrink-0">
                      ({sc._count.transactions} 明細, {sc._count.rules} ルール)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Dialog
                      open={editingSubCategory?.id === sc.id}
                      onOpenChange={open => {
                        if (!open) setEditingSubCategory(null);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-blue-400"
                          aria-label={`サブカテゴリー「${sc.name}」を編集`}
                          onClick={() =>
                            setEditingSubCategory({ id: sc.id, name: sc.name })
                          }
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>サブカテゴリー名の変更</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <Label htmlFor="edit-sub-category-name">
                            カテゴリー名
                          </Label>
                          <Input
                            id="edit-sub-category-name"
                            defaultValue={sc.name}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const input = e.currentTarget;
                                handleUpdateSubCategory(sc.id, input.value);
                              }
                            }}
                          />
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setEditingSubCategory(null)}
                          >
                            キャンセル
                          </Button>
                          <Button
                            onClick={() => {
                              const input = document.getElementById(
                                "edit-sub-category-name",
                              ) as HTMLInputElement;
                              if (input)
                                handleUpdateSubCategory(sc.id, input.value);
                            }}
                          >
                            変更
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <DeleteConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-red-400"
                          aria-label={`サブカテゴリー「${sc.name}」を削除`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                      onConfirm={() => handleDeleteSubCategory(sc.id)}
                    >
                      サブカテゴリー「{sc.name}」を削除します．
                    </DeleteConfirmDialog>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
      {cats.length === 0 && (
        <div className="py-4 text-center text-sm text-zinc-500">
          カテゴリーがありません
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          カテゴリー管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Export/Import Buttons（モバイルでは折り返して水平オーバーフローを防ぐ） */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCategories}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            カテゴリーをエクスポート
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              document.getElementById("category-import-input")?.click()
            }
            disabled={isImporting}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <Upload className="mr-2 h-3.5 w-3.5" />
            {isImporting ? "インポート中..." : "カテゴリーをインポート"}
          </Button>
          <input
            id="category-import-input"
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) setPendingImportFile(file);
              // 同一ファイルを再選択しても onChange が発火するようリセット
              e.target.value = "";
            }}
          />
          {/* インポートは全カテゴリー・ルールの削除という破壊的操作のため，
                  ファイル選択後に確認ステップを挟む */}
          <AlertDialog
            open={pendingImportFile !== null}
            onOpenChange={open => {
              if (!open) setPendingImportFile(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>インポートの確認</AlertDialogTitle>
                <AlertDialogDescription>
                  インポートすると，既存のカテゴリー・ルールがすべて削除され，
                  すべての明細のカテゴリー関連付けが解除されます．
                  <br />
                  引き続きインポートしますか？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (pendingImportFile) {
                      void handleImportCategories(pendingImportFile);
                    }
                  }}
                  className="bg-red-600"
                >
                  インポートする
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="grid gap-6 md:grid-cols-2 md:gap-4">
          <div className="space-y-2">
            <Label htmlFor="new-main-category-name">メインカテゴリー追加</Label>
            <div className="flex gap-2 w-full">
              <Select
                value={newCategoryType}
                onValueChange={setNewCategoryType}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">支出</SelectItem>
                  <SelectItem value="INCOME">収入</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="new-main-category-name"
                placeholder="食費，日用品など"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                className="flex-1 min-w-0 text-sm"
              />
              <Button
                onClick={handleAddMainCategory}
                disabled={!newCategoryName.trim() || isAddingCategory}
                size="icon"
                className="shrink-0"
                aria-label="メインカテゴリーを追加"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2 min-w-0">
            <Label>サブカテゴリー追加</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={selectedMainCategory ?? ""}
                onValueChange={setSelectedMainCategory}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="親カテゴリー" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1">
                        <CategoryTypeIcon type={c.type} className="h-3 w-3" />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 flex-1 min-w-0">
                <Input
                  placeholder="詳細分類"
                  value={newSubCategoryName}
                  onChange={e => setNewSubCategoryName(e.target.value)}
                  className="flex-1 min-w-0 text-sm"
                />
                <Button
                  onClick={handleAddSubCategory}
                  disabled={!selectedMainCategory || !newSubCategoryName.trim()}
                  size="icon"
                  className="shrink-0"
                  aria-label="サブカテゴリーを追加"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 支出カテゴリー */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-red-400">支出カテゴリー</h3>
          <div className="rounded-md border border-zinc-800 p-2">
            {renderCategoryList(expenseCategories, "EXPENSE")}
          </div>
        </div>

        {/* 収入カテゴリー */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-emerald-400">
            収入カテゴリー
          </h3>
          <div className="rounded-md border border-zinc-800 p-2">
            {renderCategoryList(incomeCategories, "INCOME")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
