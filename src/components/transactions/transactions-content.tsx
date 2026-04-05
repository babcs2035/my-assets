"use client";

import { ja } from "date-fns/locale";
import dayjs from "dayjs";
import { ArrowLeftRight, ArrowRight, List } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getCategories } from "@/actions/categories";
import {
  getMonthlyCalendarData,
  getTransactions,
  updateTransactionCategory,
} from "@/actions/transactions";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { nowJST } from "@/lib/utils";

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
  const [, startTransition] = useTransition();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  /**
   * 現在の年・月・日・ページに基づいてデータをフェッチする関数である．
   */
  const fetchData = () => {
    const dateInfo = selectedDay
      ? `${year}/${month}/${selectedDay}`
      : `${year}/${month}`;
    console.log(
      `📂 Fetching transaction data for ${dateInfo} (Page: ${page})...`,
    );
    console.log(
      `📍 Params: year=${year}, month=${month}, day=${selectedDay ?? "undefined"}, page=${page}`,
    );
    startTransition(async () => {
      try {
        const [txResult, calResult, catResult] = await Promise.all([
          getTransactions({
            year,
            month,
            day: selectedDay ?? undefined,
            page,
            pageSize: 50,
          }),
          getMonthlyCalendarData(year, month),
          getCategories(),
        ]);
        setTransactions(txResult.transactions);
        setTotalPages(txResult.totalPages);
        setCalendarData(calResult);
        setCategories(catResult);
        console.log(
          `✅ Data fetched successfully: ${txResult.transactions.length} transactions`,
        );
      } catch (error) {
        console.error("❌ Failed to fetch transaction data:", error);
        toast.error("データの取得に失敗しました．");
      }
    });
  };

  /**
   * 年，月，日，またはページが変更された際にデータを再取得する．
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional dependencies
  useEffect(() => {
    fetchData();
  }, [year, month, selectedDay, page]);

  /**
   * 取引のカテゴリーを変更し，必要に応じて自動分類ルールを更新するハンドラである．
   */
  const handleCategoryChange = async (
    transactionId: string,
    subCategoryId: string | null,
  ) => {
    console.log(`🏷️ Updating category for transaction ${transactionId}...`);
    try {
      await updateTransactionCategory({
        transactionId,
        subCategoryId,
        createRule: true,
      });
      toast.success("カテゴリーを更新しました．", {
        description: "同じ摘要の他の明細にもルールが適用されました．",
      });
      console.log("✅ Category updated successfully.");
      fetchData();
    } catch (error) {
      console.error("❌ Failed to update category:", error);
      toast.error("カテゴリーの更新に失敗しました．");
    }
  };

  /**
   * ページ番号を変更するハンドラである．
   */
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  /**
   * カレンダーの日付をクリックしたときのハンドラである．
   * その日の明細のみを表示するか，月全体表示に戻す．
   */
  const handleDayClick = (date: Date) => {
    // ローカルタイムゾーンで日付を取得
    const clickedDay = date.getDate();
    const clickedMonth = date.getMonth() + 1;
    const clickedYear = date.getFullYear();

    console.log(
      `📅 Calendar clicked: ${clickedYear}-${clickedMonth}-${clickedDay} (Date object: ${date.toString()})`,
    );

    // 異なる月の日付がクリックされた場合は月を変更
    if (clickedYear !== year || clickedMonth !== month) {
      setCurrentDate(date);
      setSelectedDay(null);
      setPage(1);
      return;
    }

    // 同じ日付をクリックした場合は選択解除（月全体表示に戻る）
    if (selectedDay === clickedDay) {
      setSelectedDay(null);
    } else {
      setSelectedDay(clickedDay);
    }
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* カレンダー表示エリア */}
        <Card>
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
          <CardContent className="p-4">
            <Calendar
              mode="single"
              selected={
                selectedDay ? new Date(year, month - 1, selectedDay) : undefined
              }
              onSelect={date => {
                if (!date) {
                  // 選択解除された場合
                  setSelectedDay(null);
                  setPage(1);
                } else {
                  handleDayClick(date);
                }
              }}
              month={currentDate}
              onMonthChange={date => {
                setCurrentDate(date);
                setSelectedDay(null);
                setPage(1);
              }}
              locale={ja}
              className="w-full rounded-md border"
              classNames={{
                month: "space-y-4 w-full",
                table: "w-full border-collapse space-y-1 table-fixed",
                head_row: "flex w-full",
                head_cell:
                  "text-muted-foreground rounded-md w-full font-normal text-[0.8rem] sm:text-[0.85rem] text-center",
                row: "flex w-full mt-2",
                cell: "h-auto w-full p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20 min-w-0 overflow-hidden",
                day: "h-16 sm:h-18 md:h-28 w-full p-1 sm:p-1.5 md:p-2 font-normal aria-selected:opacity-100 items-start justify-start hover:bg-zinc-800/50 border border-transparent hover:border-zinc-700 rounded-md transition-colors min-w-0 flex-col",
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground !bg-blue-600/30 !text-blue-100 border-blue-400",
                day_today:
                  "bg-accent/50 text-accent-foreground border-zinc-600",
              }}
              components={{
                DayContent: ({ date }) => {
                  const d = date.getDate();
                  const dateKey = `${date.getFullYear()}-${String(
                    date.getMonth() + 1,
                  ).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const data = calendarData[dateKey];

                  return (
                    <div className="flex h-full w-full flex-col items-start justify-between min-w-0 overflow-hidden">
                      <span className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200">
                        {d}
                      </span>
                      {data && (
                        <div className="flex w-full flex-col items-end gap-0.5 text-[9px] sm:text-[10px] md:text-xs min-w-0">
                          {data.income > 0 && (
                            <span
                              className="font-mono font-medium text-emerald-400 truncate w-full text-right"
                              title={`+¥${data.income.toLocaleString()}`}
                            >
                              +{data.income.toLocaleString()}
                            </span>
                          )}
                          {data.expense > 0 && (
                            <span
                              className="font-mono font-medium text-red-400 truncate w-full text-right"
                              title={`-¥${data.expense.toLocaleString()}`}
                            >
                              -{data.expense.toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                },
              }}
            />
          </CardContent>
        </Card>

        {/* 明細一覧表示エリア */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <List className="h-4 w-4" />
              明細一覧
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              // データがない場合の表示
              <div className="flex flex-col items-center justify-center py-16">
                <ArrowLeftRight className="h-10 w-10 text-zinc-600" />
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
                              {dayjs(tx.date).format("MM/DD")}
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
                            <div className="flex items-center gap-1.5 text-xs text-blue-400 mt-0.5">
                              <ArrowLeftRight className="h-3 w-3 shrink-0" />
                              <span>
                                {tx.amount < 0
                                  ? tx.subAccount.mainAccount.label
                                  : tx.linkedAccount.mainAccountLabel}
                              </span>
                              <ArrowRight className="h-3 w-3 shrink-0" />
                              <span>
                                {tx.amount < 0
                                  ? tx.linkedAccount.mainAccountLabel
                                  : tx.subAccount.mainAccount.label}
                              </span>
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500 truncate">
                              {tx.subAccount.mainAccount.label}（{tx.subAccount.currentName}）
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
                            {dayjs(tx.date).format("MM/DD")}
                          </TableCell>
                          <TableCell className="text-zinc-400 text-sm">
                            {tx.isTransfer && tx.linkedAccount ? (
                              <div className="flex items-center gap-1.5 text-blue-400">
                                <span className="whitespace-nowrap">
                                  {tx.amount < 0
                                    ? tx.subAccount.mainAccount.label
                                    : tx.linkedAccount.mainAccountLabel}
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                <span className="whitespace-nowrap">
                                  {tx.amount < 0
                                    ? tx.linkedAccount.mainAccountLabel
                                    : tx.subAccount.mainAccount.label}
                                </span>
                              </div>
                            ) : (
                              <>
                                <span className="text-zinc-300">{tx.subAccount.mainAccount.label}</span>
                                <br />
                                <span className="text-zinc-500 text-xs">
                                  {tx.subAccount.currentName}
                                </span>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-zinc-200">
                            {tx.isTransfer ? (
                              <span className="text-sm text-zinc-500 italic">—</span>
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
                              <span className="text-sm text-zinc-500 italic">—</span>
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
