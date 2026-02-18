"use client";

import { ja } from "date-fns/locale";
import dayjs from "dayjs";
import { ArrowLeftRight, List } from "lucide-react";
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
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
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
   * 現在の年・月・ページに基づいてデータをフェッチする関数である．
   */
  const fetchData = () => {
    console.log(
      `📂 Fetching transaction data for ${year}/${month} (Page: ${page})...`,
    );
    startTransition(async () => {
      try {
        const [txResult, calResult, catResult] = await Promise.all([
          getTransactions({ year, month, page, pageSize: 50 }),
          getMonthlyCalendarData(year, month),
          getCategories(),
        ]);
        setTransactions(txResult.transactions);
        setTotalPages(txResult.totalPages);
        setCalendarData(calResult);
        setCategories(catResult);
        console.log("✅ Data fetched successfully.");
      } catch (error) {
        console.error("❌ Failed to fetch transaction data:", error);
        toast.error("データの取得に失敗しました．");
      }
    });
  };

  /**
   * 年，月，またはページが変更された際にデータを再取得する．
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional dependencies
  useEffect(() => {
    fetchData();
  }, [year, month, page]);

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

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* カレンダー表示エリア */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              カレンダー
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <Calendar
              mode="single"
              selected={currentDate}
              onSelect={date => date && setCurrentDate(date)}
              month={currentDate}
              onMonthChange={setCurrentDate}
              locale={ja}
              className="w-full rounded-md border"
              classNames={{
                month: "space-y-4 w-full",
                table: "w-full border-collapse space-y-1",
                head_row: "flex w-full",
                head_cell:
                  "text-muted-foreground rounded-md w-full font-normal text-[0.8rem] text-center",
                row: "flex w-full mt-2",
                cell: "h-auto w-full p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: "h-16 md:h-24 w-full p-2 font-normal aria-selected:opacity-100 items-start justify-start hover:bg-zinc-800/50 border border-transparent hover:border-zinc-700 rounded-md transition-colors",
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground !bg-blue-600/20 !text-blue-200 border-blue-500",
                day_today: "bg-accent/50 text-accent-foreground",
              }}
              components={{
                DayContent: ({ date }) => {
                  const d = date.getDate();
                  const dateKey = `${date.getFullYear()}-${String(
                    date.getMonth() + 1,
                  ).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const data = calendarData[dateKey];

                  return (
                    <div className="flex h-full w-full flex-col items-start justify-between">
                      <span className="text-sm font-medium">{d}</span>
                      {data && (
                        <div className="flex w-full flex-col items-end gap-0.5 text-[10px]">
                          {data.income > 0 && (
                            <span className="font-mono text-emerald-400">
                              +{data.income.toLocaleString()}
                            </span>
                          )}
                          {data.expense > 0 && (
                            <span className="font-mono text-red-400">
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
                      className={`p-4 ${tx.isTransfer ? "opacity-70" : ""}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm text-zinc-400">
                          {dayjs(tx.date).format("MM/DD")}
                        </div>
                        <div
                          className={`font-mono font-medium ${
                            tx.amount >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {tx.amount >= 0 && "+"}
                          {tx.amount.toLocaleString()}
                        </div>
                      </div>
                      <div className="mb-2">
                        <div className="text-base text-zinc-200">{tx.desc}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {tx.subAccount.mainAccount.label} (
                          {tx.subAccount.currentName})
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3">
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
                            {categories.map(mc =>
                              mc.subCategories.map(sc => (
                                <SelectItem key={sc.id} value={sc.id}>
                                  {mc.name} / {sc.name}
                                </SelectItem>
                              )),
                            )}
                          </SelectContent>
                        </Select>
                        {tx.isTransfer && (
                          <Badge variant="secondary" className="text-[10px]">
                            振替
                          </Badge>
                        )}
                      </div>
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
                        <TableHead>状態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map(tx => (
                        <TableRow
                          key={tx.id}
                          className={tx.isTransfer ? "opacity-50" : ""}
                        >
                          <TableCell className="whitespace-nowrap text-zinc-300">
                            {dayjs(tx.date).format("MM/DD")}
                          </TableCell>
                          <TableCell className="text-zinc-400 text-xs">
                            {tx.subAccount.mainAccount.label}
                            <br />
                            <span className="text-zinc-500">
                              {tx.subAccount.currentName}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-zinc-200">
                            {tx.desc}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-medium ${
                              tx.amount >= 0
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {tx.amount >= 0 ? "+" : ""}
                            {tx.amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={tx.subCategoryId ?? "none"}
                              onValueChange={val =>
                                handleCategoryChange(
                                  tx.id,
                                  val === "none" ? null : val,
                                )
                              }
                            >
                              <SelectTrigger className="h-7 w-[160px] text-xs">
                                <SelectValue placeholder="未分類" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">未分類</SelectItem>
                                {categories.map(mc =>
                                  mc.subCategories.map(sc => (
                                    <SelectItem key={sc.id} value={sc.id}>
                                      {mc.name} / {sc.name}
                                    </SelectItem>
                                  )),
                                )}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {tx.isTransfer && (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                振替
                              </Badge>
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
