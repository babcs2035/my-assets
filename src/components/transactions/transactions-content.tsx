"use client";

import { List, Loader2, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getCategories } from "@/actions/categories";
import {
  getMonthlyCalendarData,
  getTransactionFilterOptions,
  getTransactions,
  updateTransactionCategory,
} from "@/actions/transactions";
import { CalendarGrid } from "@/components/transactions/calendar-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { formatJSTDate, nowJST } from "@/lib/utils";

/**
 * 取引明細の型定義である．
 */
type Transaction = Awaited<
  ReturnType<typeof getTransactions>
>["transactions"][number];

/**
 * カテゴリーの型定義である．
 */
type Category = Awaited<ReturnType<typeof getCategories>>[number];
type FilterOption = Awaited<
  ReturnType<typeof getTransactionFilterOptions>
>[number];

/**
 * 明細管理ページのメインコンテンツコンポーネントである．
 * カレンダー表示と一覧表示の 2 つの形式で取引明細を確認・管理できる．
 */
export function TransactionsContent() {
  const [currentDate, setCurrentDate] = useState<Date>(nowJST());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [calendarData, setCalendarData] = useState<
    Record<string, { income: number; expense: number }>
  >({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const [selectedMainAccountId, setSelectedMainAccountId] = useState("all");
  const [selectedSubAccountId, setSelectedSubAccountId] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const now = nowJST();
  const yearOptions = Array.from(
    { length: now.getFullYear() - 2023 + 2 },
    (_, i) => 2023 + i,
  );
  const _monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const activeMainAccountId =
    selectedMainAccountId === "all" ? undefined : selectedMainAccountId;
  const activeSubAccountId =
    selectedSubAccountId === "all" ? undefined : selectedSubAccountId;
  const availableSubAccounts =
    selectedMainAccountId === "all"
      ? filterOptions.flatMap(ma =>
          ma.subAccounts.map(sa => ({
            ...sa,
            mainLabel: ma.label,
          })),
        )
      : (filterOptions.find(ma => ma.id === selectedMainAccountId)
          ?.subAccounts ?? []);

  /**
   * 現在の年・月・日・ページに基づいてデータをフェッチする関数である．
   * ローカルなローディング状態を管理しながら実行する．
   */
  const fetchData = () => {
    setIsLoading(true);
    startTransition(async () => {
      try {
        const [txResult, calResult, catResult] = await Promise.all([
          getTransactions({
            mainAccountId: activeMainAccountId,
            subAccountId: activeSubAccountId,
            year,
            month,
            day: selectedDay ?? undefined,
            page,
            pageSize: 50,
          }),
          getMonthlyCalendarData(year, month, {
            mainAccountId: activeMainAccountId,
            subAccountId: activeSubAccountId,
          }),
          getCategories(),
        ]);
        setTransactions(txResult.transactions);
        setTotalPages(txResult.totalPages);
        setCalendarData(calResult);
        setCategories(catResult);
      } catch {
        toast.error("データの取得に失敗しました．");
      } finally {
        setIsLoading(false);
      }
    });
  };

  /**
   * 年，月，日，またはページが変更された際にデータを再取得する．
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional dependencies
  useEffect(() => {
    fetchData();
  }, [year, month, selectedDay, page, activeMainAccountId, activeSubAccountId]);

  useEffect(() => {
    startTransition(async () => {
      try {
        const options = await getTransactionFilterOptions();
        setFilterOptions(options);
      } catch {}
    });
  }, []);

  useEffect(() => {
    if (selectedSubAccountId === "all") return;
    const validSubAccountIds = new Set(availableSubAccounts.map(sa => sa.id));
    if (!validSubAccountIds.has(selectedSubAccountId)) {
      setSelectedSubAccountId("all");
      setPage(1);
    }
  }, [availableSubAccounts, selectedSubAccountId]);

  /**
   * 取引のカテゴリーを変更し，必要に応じて自動分類ルールを更新するハンドラである．
   */
  const handleCategoryChange = async (
    transactionId: string,
    subCategoryId: string | null,
  ) => {
    try {
      await updateTransactionCategory({
        transactionId,
        subCategoryId,
        createRule: true,
      });
      toast.success("カテゴリーを更新しました．", {
        description: "同じ摘要の他の明細にもルールが適用されました．",
      });
      fetchData();
    } catch {
      toast.error("カテゴリーの更新に失敗しました．");
    }
  };

  /**
   * ページ番号を変更するハンドラである．
   */
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* カレンダー表示エリア */}
        <Card className="relative">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              カレンダー
              {selectedDay && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {month}/{selectedDay} の明細
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative p-4">
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
            <CalendarGrid
              year={year}
              month={month}
              selectedDay={selectedDay}
              calendarData={calendarData}
              availableYears={yearOptions}
              onMonthChange={(newYear, newMonth) => {
                setCurrentDate(new Date(newYear, newMonth - 1, 1));
                setSelectedDay(null);
                setPage(1);
              }}
              onDayClick={day => {
                if (selectedDay === day) {
                  setSelectedDay(null);
                } else {
                  setSelectedDay(day);
                }
                setPage(1);
              }}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full sm:w-auto"
                onClick={() => {
                  setCurrentDate(
                    new Date(now.getFullYear(), now.getMonth(), 1),
                  );
                  setSelectedDay(null);
                  setPage(1);
                }}
              >
                今月
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 明細一覧表示エリア */}
        <Card className="relative">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <List className="h-4 w-4" />
              明細一覧
            </CardTitle>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 justify-start gap-2"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="truncate">
                      {selectedSubAccountId !== "all"
                        ? `子口座: ${availableSubAccounts.find(sa => sa.id === selectedSubAccountId)?.name ?? "選択中"}`
                        : selectedMainAccountId !== "all"
                          ? `金融機関: ${filterOptions.find(ma => ma.id === selectedMainAccountId)?.label ?? "選択中"}`
                          : "金融機関・子口座で絞り込み"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuLabel>表示フィルター</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setSelectedMainAccountId("all");
                      setSelectedSubAccountId("all");
                      setSelectedDay(null);
                      setPage(1);
                    }}
                  >
                    すべての金融機関・子口座
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {filterOptions.map(ma => (
                    <DropdownMenuSub key={ma.id}>
                      <DropdownMenuSubTrigger>
                        {ma.label}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-72">
                          <DropdownMenuItem
                            onSelect={() => {
                              setSelectedMainAccountId(ma.id);
                              setSelectedSubAccountId("all");
                              setSelectedDay(null);
                              setPage(1);
                            }}
                          >
                            {ma.label}（すべて）
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {ma.subAccounts.map(sa => (
                            <DropdownMenuItem
                              key={sa.id}
                              onSelect={() => {
                                setSelectedMainAccountId(ma.id);
                                setSelectedSubAccountId(sa.id);
                                setSelectedDay(null);
                                setPage(1);
                              }}
                            >
                              {sa.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => {
                  setSelectedMainAccountId("all");
                  setSelectedSubAccountId("all");
                  setSelectedDay(null);
                  setPage(1);
                }}
              >
                絞り込み解除
              </Button>
            </div>
          </CardHeader>
          <CardContent className="relative p-0">
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
            {transactions.length === 0 ? (
              // データがない場合の表示
              <div className="flex flex-col items-center justify-center py-16">
                <List className="h-10 w-10 text-zinc-600" />
                <p className="mt-3 text-sm text-zinc-500">
                  この月の明細はありません．
                </p>
              </div>
            ) : (
              <>
                {/* モバイル用ビュー (カード形式) */}
                <div className="md:hidden divide-y divide-zinc-800">
                  {transactions.map(tx => (
                    <div
                      key={tx.id}
                      className={`p-3 ${tx.isTransfer ? "opacity-70" : ""}`}
                    >
                      <div className="flex justify-between items-start gap-2 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-zinc-500 shrink-0">
                              {formatJSTDate(tx.date)
                                .slice(5)
                                .replace("-", "/")}
                            </span>
                            {tx.isTransfer ? (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1 py-0 h-4 bg-blue-500/10 text-blue-400 border-blue-500/30"
                              >
                                振替
                              </Badge>
                            ) : (
                              <span className="text-sm font-medium text-zinc-200 truncate">
                                {tx.desc}
                              </span>
                            )}
                          </div>
                          {tx.isTransfer && tx.linkedAccount ? (
                            <div className="flex flex-col gap-1 text-xs text-blue-400 mt-0.5">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate">
                                  {tx.amount < 0
                                    ? `${tx.subAccount.mainAccount.label}（${tx.subAccount.currentName}）`
                                    : `${tx.linkedAccount.mainAccountLabel}（${tx.linkedAccount.subAccountName}）`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate">
                                  {tx.amount < 0
                                    ? `${tx.linkedAccount.mainAccountLabel}（${tx.linkedAccount.subAccountName}）`
                                    : `${tx.subAccount.mainAccount.label}（${tx.subAccount.currentName}）`}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500 truncate">
                              {tx.subAccount.mainAccount.label}（
                              {tx.subAccount.currentName}）
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end shrink-0 gap-1">
                          <div
                            className={`font-mono font-medium text-sm ${
                              tx.isTransfer
                                ? "text-blue-400"
                                : tx.amount >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                            }`}
                          >
                            {tx.amount >= 0 && "+"}
                            {tx.amount.toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {/* 振替でない場合のみカテゴリーセレクターを表示する */}
                      {!tx.isTransfer && (
                        <div className="flex items-center justify-between mt-2">
                          <Select
                            value={tx.subCategoryId ?? "none"}
                            onValueChange={val =>
                              handleCategoryChange(
                                tx.id,
                                val === "none" ? null : val,
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue placeholder="未分類" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">未分類</SelectItem>
                              {categories
                                .filter(
                                  mc =>
                                    (mc as Category & { type: string }).type ===
                                    (tx.amount >= 0 ? "INCOME" : "EXPENSE"),
                                )
                                .map(mc =>
                                  mc.subCategories.map(sc => (
                                    <SelectItem key={sc.id} value={sc.id}>
                                      {mc.name} / {sc.name}
                                    </SelectItem>
                                  )),
                                )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* デスクトップ用ビュー (テーブル形式) */}
                <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>日付</TableHead>
                        <TableHead>口座</TableHead>
                        <TableHead>摘要</TableHead>
                        <TableHead className="text-right">金額</TableHead>
                        <TableHead>カテゴリー</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map(tx => (
                        <TableRow
                          key={tx.id}
                          className={tx.isTransfer ? "opacity-60" : ""}
                        >
                          <TableCell className="whitespace-nowrap text-zinc-300">
                            {formatJSTDate(tx.date).slice(5).replace("-", "/")}
                          </TableCell>
                          <TableCell className="text-zinc-400 text-sm">
                            {tx.isTransfer && tx.linkedAccount ? (
                              <div className="flex flex-col gap-1 text-xs text-blue-400">
                                <div className="flex items-center gap-1.5 truncate">
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1 py-0 h-4 bg-blue-500/10 text-blue-400 border-blue-500/30 shrink-0"
                                  >
                                    振替
                                  </Badge>
                                  <span className="truncate">
                                    {tx.amount < 0
                                      ? `${tx.subAccount.mainAccount.label}（${tx.subAccount.currentName}）`
                                      : `${tx.linkedAccount.mainAccountLabel}（${tx.linkedAccount.subAccountName}）`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 truncate ml-[38px]">
                                  <span className="truncate">
                                    {tx.amount < 0
                                      ? `${tx.linkedAccount.mainAccountLabel}（${tx.linkedAccount.subAccountName}）`
                                      : `${tx.subAccount.mainAccount.label}（${tx.subAccount.currentName}）`}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="text-zinc-300">
                                  {tx.subAccount.mainAccount.label}
                                </span>
                                <br />
                                <span className="text-zinc-500 text-xs">
                                  {tx.subAccount.currentName}
                                </span>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-zinc-200">
                            {tx.isTransfer ? (
                              <span className="text-sm text-zinc-500 italic">
                                —
                              </span>
                            ) : (
                              tx.desc
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-medium ${
                              tx.isTransfer
                                ? "text-blue-400"
                                : tx.amount >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                            }`}
                          >
                            {tx.amount >= 0 ? "+" : ""}
                            {tx.amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {tx.isTransfer ? (
                              <span className="text-sm text-zinc-500 italic">
                                —
                              </span>
                            ) : (
                              <Select
                                value={tx.subCategoryId ?? "none"}
                                onValueChange={val =>
                                  handleCategoryChange(
                                    tx.id,
                                    val === "none" ? null : val,
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 w-[180px] text-sm">
                                  <SelectValue placeholder="未分類" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">未分類</SelectItem>
                                  {categories
                                    .filter(
                                      mc =>
                                        (mc as Category & { type: string })
                                          .type ===
                                        (tx.amount >= 0 ? "INCOME" : "EXPENSE"),
                                    )
                                    .map(mc =>
                                      mc.subCategories.map(sc => (
                                        <SelectItem key={sc.id} value={sc.id}>
                                          {mc.name} / {sc.name}
                                        </SelectItem>
                                      )),
                                    )}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {/* ページネーションコントロール */}
            {totalPages > 1 && (
              <div className="py-4 border-t border-zinc-800">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={e => {
                          e.preventDefault();
                          if (page > 1) {
                            handlePageChange(page - 1);
                          }
                        }}
                        className={
                          page <= 1 ? "pointer-events-none opacity-50" : ""
                        }
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="text-sm text-zinc-500 mx-2">
                        Page {page} of {totalPages}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={e => {
                          e.preventDefault();
                          if (page < totalPages) {
                            handlePageChange(page + 1);
                          }
                        }}
                        className={
                          page >= totalPages
                            ? "pointer-events-none opacity-50"
                            : ""
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
