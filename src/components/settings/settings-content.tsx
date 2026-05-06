"use client";

import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  GripVertical,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteMainAccount, getAccounts } from "@/actions/accounts";
import {
  createCategoryRule,
  createMainCategory,
  createSubCategory,
  deleteCategoryRule,
  deleteMainCategory,
  deleteSubCategory,
  getCategories,
  getCategoryRules,
  reorderMainCategories,
  reorderSubCategories,
} from "@/actions/categories";
import {
  abortSyncProvider,
  createProvider,
  deleteProvider,
  getProviders,
  syncProvider,
} from "@/actions/providers";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { assetTypeColor } from "@/lib/utils";

// Types
type Provider = Awaited<ReturnType<typeof getProviders>>[number];
type Account = Awaited<ReturnType<typeof getAccounts>>[number];
type Category = Awaited<ReturnType<typeof getCategories>>[number];
type CategoryRule = Awaited<ReturnType<typeof getCategoryRules>>[number];

/**
 * プロバイダーのタイプ表示名を返すヘルパー関数である．
 */
function getProviderTypeLabel(type: string): string {
  if (type === "mf") return "MoneyForward";
  if (type === "custom") return "カスタム";
  return type;
}

/**
 * 日時をフォーマットするヘルパー関数である．
 * @deprecated formatJSTDateTime を使用してください．
 */
function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  // JST オフセット (UTC+9)
  const jstOffset = 9 * 60 * 60 * 1000;
  const utc = d.getTime() + d.getTimezoneOffset() * 60 * 1000;
  const jst = new Date(utc + jstOffset);
  return `${jst.getFullYear()}/${(jst.getMonth() + 1).toString().padStart(2, "0")}/${jst.getDate().toString().padStart(2, "0")} ${jst.getHours().toString().padStart(2, "0")}:${jst.getMinutes().toString().padStart(2, "0")}`;
}

/**
 * カテゴリーの収支タイプに応じたアイコンを返すヘルパーである．
 */
function CategoryTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  if (type === "INCOME") return <TrendingUp className={className} />;
  return <TrendingDown className={className} />;
}

export function SettingsContent() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenseCategoryItems, setExpenseCategoryItems] = useState<Category[]>(
    [],
  );
  const [incomeCategoryItems, setIncomeCategoryItems] = useState<Category[]>(
    [],
  );
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [syncingProviderIds, setSyncingProviderIds] = useState<Set<string>>(
    new Set(),
  );
  const [syncDialogProviderId, setSyncDialogProviderId] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  // Provider Form State
  const [providerName, setProviderName] = useState("");
  const [providerType, setProviderType] = useState<string>("mf");
  const [scraperScript, setScraperScript] = useState("");
  const [isCustomProvider, setIsCustomProvider] = useState(false);

  // Category Form State
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<string>("EXPENSE");
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

  // Rule Form State
  const [ruleKeywords, setRuleKeywords] = useState("");
  const [ruleSubCategoryId, setRuleSubCategoryId] = useState<string>("");

  /**
   * 必要な初期データをサーバーアクションからまとめて取得する関数である．
   */
  const fetchData = useCallback(() => {
    setIsLoading(true);
    startTransition(async () => {
      try {
        const [p, a, c, r] = await Promise.all([
          getProviders(),
          getAccounts(),
          getCategories(),
          getCategoryRules(),
        ]);
        setProviders(p);
        setAccounts(a);
        setCategories(c);
        setExpenseCategoryItems(
          c.filter(
            cat => (cat as Category & { type: string }).type === "EXPENSE",
          ),
        );
        setIncomeCategoryItems(
          c.filter(
            cat => (cat as Category & { type: string }).type === "INCOME",
          ),
        );
        setRules(r);
      } catch (error) {
        console.error("Failed to fetch settings data:", error);
        toast.error("設定データのフェッチに失敗しました．");
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- ハンドラ関数群 ---

  const handleDeleteAccount = async (id: string, name: string) => {
    try {
      await deleteMainAccount(id);
      toast.success(`口座「${name}」を削除しました．`);
      fetchData();
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast.error("口座の削除に失敗しました．");
    }
  };

  const handleAddProvider = async () => {
    if (!providerName) return;
    try {
      await createProvider({
        name: providerName,
        type: providerType,
        scraperScript: isCustomProvider ? scraperScript : undefined,
      });
      toast.success("プロバイダーを追加しました．");
      setProviderName("");
      setScraperScript("");
      setIsCustomProvider(false);
      fetchData();
    } catch (error) {
      console.error("Failed to add provider:", error);
      toast.error("プロバイダーの追加に失敗しました．");
    }
  };

  const handleDeleteProvider = async (id: string, name: string) => {
    try {
      await deleteProvider(id);
      toast.success(`プロバイダー「${name}」を削除しました．`);
      fetchData();
    } catch (error) {
      console.error("Failed to delete provider:", error);
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
      fetchData();
    } catch (error) {
      console.error("Failed to sync provider:", error);
      window.dispatchEvent(
        new CustomEvent("provider-sync-status", {
          detail: { providerId: id, status: "error" },
        }),
      );
      // 中止された場合は別のメッセージを表示
      const errorMessage =
        error instanceof Error && error.message.includes("aborted")
          ? "同期を中止しました．"
          : "同期に失敗しました．";
      toast.error(errorMessage);
      fetchData();
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
      window.dispatchEvent(
        new CustomEvent("provider-sync-status", {
          detail: { providerId: id, status: "error" },
        }),
      );
      toast.success("同期を中止しました．");
      fetchData();
    } catch (error) {
      console.error("Failed to abort sync:", error);
      toast.error("同期の中止に失敗しました．");
    } finally {
      setSyncingProviderIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleAddMainCategory = async () => {
    if (!newCategoryName) return;
    try {
      await createMainCategory({
        name: newCategoryName,
        type: newCategoryType as "INCOME" | "EXPENSE",
      });
      toast.success("カテゴリーを追加しました．");
      setNewCategoryName("");
      fetchData();
    } catch (error) {
      console.error("Failed to add main category:", error);
      toast.error("カテゴリーの追加に失敗しました．");
    }
  };

  const handleDeleteMainCategory = async (id: string) => {
    try {
      await deleteMainCategory(id);
      toast.success("カテゴリーを削除しました．");
      fetchData();
    } catch (error) {
      console.error("Failed to delete main category:", error);
      toast.error("カテゴリーの削除に失敗しました．");
    }
  };

  const handleAddSubCategory = async () => {
    if (!selectedMainCategory || !newSubCategoryName) return;
    try {
      await createSubCategory({
        mainCategoryId: selectedMainCategory,
        name: newSubCategoryName,
      });
      toast.success("サブカテゴリーを追加しました．");
      setNewSubCategoryName("");
      setExpandedCategories(prev => new Set(prev).add(selectedMainCategory));
      fetchData();
    } catch (error) {
      console.error("Failed to add sub-category:", error);
      toast.error("サブカテゴリーの追加に失敗しました．");
    }
  };

  const handleDeleteSubCategory = async (id: string) => {
    try {
      await deleteSubCategory(id);
      toast.success("サブカテゴリーを削除しました．");
      fetchData();
    } catch (error) {
      console.error("Failed to delete sub-category:", error);
      toast.error("サブカテゴリーの削除に失敗しました．");
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

  const handleReorderCategory = async (
    type: "INCOME" | "EXPENSE",
    orderedIds: string[],
  ) => {
    try {
      await reorderMainCategories(type, orderedIds);
      fetchData();
    } catch (error) {
      console.error("Failed to reorder category:", error);
      toast.error("カテゴリーの並べ替えに失敗しました．");
    }
  };

  const handleReorderSubCategory = async (
    mainCategoryId: string,
    orderedIds: string[],
  ) => {
    try {
      await reorderSubCategories(mainCategoryId, orderedIds);
      fetchData();
    } catch (error) {
      console.error("Failed to reorder sub category:", error);
      toast.error("サブカテゴリーの並べ替えに失敗しました．");
    }
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
        await handleReorderCategory(currentType, orderedIds);
        toast.success("並び順を更新しました．");
      } catch (error) {
        console.error("Failed to reorder category:", error);
        toast.error("カテゴリーの並べ替えに失敗しました．");
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
        ? [...expenseCategoryItems]
        : [...incomeCategoryItems];
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
        await handleReorderSubCategory(mainCategoryId, orderedIds);
        toast.success("並び順を更新しました．");
      } catch (error) {
        console.error("Failed to reorder sub category:", error);
        toast.error("サブカテゴリーの並べ替えに失敗しました．");
      }
    });
  };

  const handleAddRule = async () => {
    if (!ruleKeywords || !ruleSubCategoryId) return;
    try {
      await createCategoryRule({
        keyword: ruleKeywords,
        subCategoryId: ruleSubCategoryId,
        priority: 0,
      });
      toast.success("ルールを追加しました．");
      setRuleKeywords("");
      setRuleSubCategoryId("");
      fetchData();
    } catch (error) {
      console.error("Failed to add rule:", error);
      toast.error("ルールの追加に失敗しました．");
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await deleteCategoryRule(id);
      toast.success("ルールを削除しました．");
      fetchData();
    } catch (error) {
      console.error("Failed to delete rule:", error);
      toast.error("ルールの削除に失敗しました．");
    }
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
              <GripVertical className="h-4 w-4 shrink-0 text-zinc-500" />
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
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {mc.subCategories.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-500 hover:text-red-400"
                    onClick={e => e.stopPropagation()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>削除確認</AlertDialogTitle>
                    <AlertDialogDescription>
                      メインカテゴリー「{mc.name}
                      」を削除します。サブカテゴリーがある場合は削除できません。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteMainCategory(mc.id)}
                      className="bg-red-600"
                    >
                      削除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
                    <GripVertical className="h-3 w-3 shrink-0 text-zinc-500" />
                    <span className="text-sm text-zinc-300 truncate">
                      {sc.name}
                    </span>
                    <span className="text-[10px] text-zinc-600 shrink-0">
                      ({sc._count.transactions} 明細, {sc._count.rules} ルール)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-zinc-600 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>削除確認</AlertDialogTitle>
                          <AlertDialogDescription>
                            サブカテゴリー「{sc.name}」を削除します。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>キャンセル</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteSubCategory(sc.id)}
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
    <div className="space-y-8">
      <div className="grid gap-8">
        {/* プロバイダー設定セクション */}
        <Card className="relative">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-blue-400" />
              プロバイダー設定
            </CardTitle>
            <CardDescription>
              外部サービス (MoneyForward など)
              との連携や，データ取得元の設定を行います．
            </CardDescription>
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
                    setProviderType(v);
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
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full" disabled={!providerName}>
                        <Plus className="mr-2 h-4 w-4" />
                        追加
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>スクレーパースクリプトの設定</DialogTitle>
                        <DialogDescription>
                          Playwrightを使用したスクレーピングスクリプトを入力してください。
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>スクリプト (TypeScript)</Label>
                          <Textarea
                            className="font-mono text-xs min-h-[300px]"
                            placeholder="// Playwright script..."
                            value={scraperScript}
                            onChange={e => setScraperScript(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleAddProvider}>
                          保存して追加
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button
                    className="w-full"
                    disabled={!providerName}
                    onClick={handleAddProvider}
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
                      const isSyncing =
                        syncingProviderIds.has(provider.id) ||
                        provider.lastSyncSuccess === null;
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
                                {formatDateTime(provider.lastSyncAt)}
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
                                onClick={() =>
                                  handleAbortSyncProvider(provider.id)
                                }
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
                                      手動同期では 2023-01-01
                                      まで遡って、入出金明細と残高推移を全件取得します。
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
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-zinc-500 hover:text-red-400"
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  削除
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>削除確認</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    プロバイダー「{provider.name}
                                    」を削除しますか？
                                    関連する口座データも削除される可能性があります。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    キャンセル
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleDeleteProvider(
                                        provider.id,
                                        provider.name,
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
                      <TableHead>名前</TableHead>
                      <TableHead>タイプ</TableHead>
                      <TableHead>最終同期</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead className="text-right">操作</TableHead>
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
                          {formatDateTime(provider.lastSyncAt)}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const isSyncing =
                              syncingProviderIds.has(provider.id) ||
                              provider.lastSyncSuccess === null;
                            if (isSyncing) {
                              return (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]"
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
                                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]"
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
                                  className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]"
                                >
                                  <XCircle className="mr-1 h-3 w-3" />
                                  失敗
                                </Badge>
                              );
                            }
                            return (
                              <span className="text-xs text-zinc-500">—</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {(() => {
                              const isSyncingDesktop =
                                syncingProviderIds.has(provider.id) ||
                                provider.lastSyncSuccess === null;
                              if (isSyncingDesktop) {
                                return (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      handleAbortSyncProvider(provider.id)
                                    }
                                    title="中止"
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    <Square className="h-4 w-4" />
                                  </Button>
                                );
                              }
                              return (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleSyncProvider(provider.id)
                                  }
                                  title="同期"
                                >
                                  <RefreshCw className="h-4 w-4 text-blue-400" />
                                </Button>
                              );
                            })()}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-zinc-500 hover:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>削除確認</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    プロバイダー「{provider.name}
                                    」を削除しますか？
                                    関連する口座データも削除される可能性があります。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    キャンセル
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleDeleteProvider(
                                        provider.id,
                                        provider.name,
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
                    {providers.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
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

        {/* Account Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-orange-400" />
              保有口座管理
            </CardTitle>
            <CardDescription>
              登録されている金融機関・口座の一覧です。手動での口座追加も可能です。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Account List by Provider */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-400">口座一覧</h3>
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
                          className="text-[10px] h-5 px-1.5 text-zinc-500 border-zinc-700 shrink-0"
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
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-zinc-600 hover:text-red-400 -mt-1 -mr-2"
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
                                          」を削除しますか？関連する明細履歴もすべて削除されます。
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
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {ac.subAccounts.map(sub => (
                                    <Badge
                                      key={sub.id}
                                      variant="secondary"
                                      className="text-[9px] max-w-[120px] truncate px-1.5 py-0"
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
                              </div>
                            ))}
                          </div>

                          {/* Desktop View */}
                          <div className="hidden md:block overflow-x-auto">
                            <Table className="min-w-[500px]">
                              <TableHeader>
                                <TableRow className="hover:bg-transparent border-zinc-800">
                                  <TableHead className="h-8 text-xs">
                                    金融機関
                                  </TableHead>
                                  <TableHead className="h-8 text-xs">
                                    内訳・詳細
                                  </TableHead>
                                  <TableHead className="h-8 text-xs text-right">
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
                                            className="text-[9px] max-w-[140px] truncate px-1.5 py-0"
                                            style={{
                                              background: `${assetTypeColor(sub.assetType)}20`,
                                              borderColor: assetTypeColor(
                                                sub.assetType,
                                              ),
                                              color: assetTypeColor(
                                                sub.assetType,
                                              ),
                                            }}
                                          >
                                            {sub.currentName}
                                          </Badge>
                                        ))}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2 text-right whitespace-nowrap">
                                      <div className="flex justify-end">
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 text-zinc-600 hover:text-red-400"
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
                                                」を削除しますか？関連する明細履歴もすべて削除されます。
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

        {/* カテゴリー管理セクション */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-green-400" />
              カテゴリー管理
            </CardTitle>
            <CardDescription>
              支出・収入それぞれのカテゴリーを管理します．上下ボタンで並び替えが可能です．
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2 md:gap-4">
              <div className="space-y-2">
                <Label>メインカテゴリー追加</Label>
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
                    placeholder="食費、日用品など"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    className="flex-1 min-w-0 text-sm"
                  />
                  <Button
                    onClick={handleAddMainCategory}
                    disabled={!newCategoryName}
                    size="icon"
                    className="shrink-0"
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
                            <CategoryTypeIcon
                              type={(c as Category & { type: string }).type}
                              className="h-3 w-3"
                            />
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
                      disabled={!selectedMainCategory || !newSubCategoryName}
                      size="icon"
                      className="shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 支出カテゴリー */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-red-400 flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4" />
                支出カテゴリー
              </h3>
              <div className="rounded-md border border-zinc-800 p-2">
                {renderCategoryList(expenseCategories, "EXPENSE")}
              </div>
            </div>

            {/* 収入カテゴリー */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" />
                収入カテゴリー
              </h3>
              <div className="rounded-md border border-zinc-800 p-2">
                {renderCategoryList(incomeCategories, "INCOME")}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 自動仕訳ルール管理セクション */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-purple-400" />
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
                            <CategoryTypeIcon
                              type={(mc as Category & { type: string }).type}
                              className="h-3 w-3"
                            />
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
                disabled={!ruleKeywords || !ruleSubCategoryId}
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
                          className="text-[10px] truncate max-w-full"
                        >
                          {rule.subCategory.mainCategory.name} /{" "}
                          {rule.subCategory.name}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-zinc-500 hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {rules.length === 0 && (
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
                      <TableHead>キーワード</TableHead>
                      <TableHead>適用カテゴリー</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-mono text-zinc-300">
                          {rule.keyword}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {rule.subCategory.mainCategory.name} /{" "}
                            {rule.subCategory.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rules.length === 0 && (
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
      </div>
    </div>
  );
}
