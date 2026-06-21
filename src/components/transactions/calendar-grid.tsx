"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatJSTDate } from "@/lib/utils";

/**
 * 支出額に基づいてヒートマップの色を計算する。
 * 0〜maxExpenseの範囲で濃さを決定。
 */
function getHeatmapColor(expense: number, maxExpense: number): string {
  if (maxExpense === 0) return "bg-zinc-950";
  const ratio = Math.min(expense / maxExpense, 1);
  if (ratio < 0.1) return "bg-red-400/10";
  if (ratio < 0.2) return "bg-red-400/15";
  if (ratio < 0.3) return "bg-red-400/20";
  if (ratio < 0.4) return "bg-red-400/25";
  if (ratio < 0.5) return "bg-red-400/30";
  if (ratio < 0.6) return "bg-red-500/30";
  if (ratio < 0.7) return "bg-red-500/35";
  if (ratio < 0.8) return "bg-red-500/40";
  if (ratio < 0.9) return "bg-red-500/45";
  return "bg-red-500/50";
}

type CalendarData = {
  income: number;
  expense: number;
};

interface CalendarGridProps {
  year: number;
  month: number;
  selectedDay: number | null;
  calendarData: Record<string, CalendarData>;
  onMonthChange: (year: number, month: number) => void;
  onDayClick: (day: number) => void;
  availableYears?: number[];
}

/**
 * 当月の最大支出額を計算する。
 */
function getMaxExpense(calendarData: Record<string, CalendarData>): number {
  let max = 0;
  for (const data of Object.values(calendarData)) {
    if (data.expense > max) max = data.expense;
  }
  return max;
}

/**
 * 月間カレンダーグリッド表示コンポーネント
 * DayPicker を使わず、シンプルな手作り実装で確実に 7 列グリッドを表示する
 * 年月セレクトをカレンダーヘッダーに統合している
 */
export function CalendarGrid({
  year,
  month,
  selectedDay,
  calendarData,
  onMonthChange,
  onDayClick,
  availableYears = [],
}: CalendarGridProps) {
  const maxExpense = getMaxExpense(calendarData);
  // 月の1日
  const firstDay = new Date(year, month - 1, 1);
  // 月の最後の日
  const lastDay = new Date(year, month, 0);
  // 月の日数
  const daysInMonth = lastDay.getDate();
  // 月の第1日が何曜日か (0=日, 1=月, ..., 6=土)
  const startDayOfWeek = firstDay.getDay();
  // 前月の日数
  const prevMonthDays = new Date(year, month - 1, 0).getDate();

  // カレンダーセルのデータを生成
  const calendarCells: Array<{
    day: number;
    isCurrentMonth: boolean;
    isPastMonth: boolean;
  }> = [];

  // 前月の日付を追加
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    calendarCells.push({
      day: prevMonthDays - i,
      isCurrentMonth: false,
      isPastMonth: true,
    });
  }

  // 今月の日付を追加
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push({
      day: d,
      isCurrentMonth: true,
      isPastMonth: false,
    });
  }

  // 次月の日付を追加（7行に揃えるため）
  const remainingCells = 42 - calendarCells.length; // 7列 × 6行 = 42
  for (let d = 1; d <= remainingCells; d++) {
    calendarCells.push({
      day: d,
      isCurrentMonth: false,
      isPastMonth: false,
    });
  }

  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="w-full space-y-3">
      {/* ヘッダー: 年月選択と前後ボタン */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          {availableYears.length > 0 && (
            <Select
              value={String(year)}
              onValueChange={value => {
                const y = Number(value);
                if (Number.isFinite(y)) {
                  onMonthChange(y, month);
                }
              }}
            >
              <SelectTrigger className="h-9 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(y => (
                  <SelectItem key={y} value={String(y)}>
                    {y}年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={String(month)}
            onValueChange={value => {
              const m = Number(value);
              if (Number.isFinite(m)) {
                onMonthChange(year, m);
              }
            }}
          >
            <SelectTrigger className="h-9 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => (
                <SelectItem key={m} value={String(m)}>
                  {m}月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => {
              if (month === 1) {
                onMonthChange(year - 1, 12);
              } else {
                onMonthChange(year, month - 1);
              }
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => {
              if (month === 12) {
                onMonthChange(year + 1, 1);
              } else {
                onMonthChange(year, month + 1);
              }
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <div className="w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 gap-0 border-b border-zinc-800 bg-zinc-900/50">
          {weekDays.map(day => (
            <div
              key={day}
              className="flex items-center justify-center py-2 text-xs font-medium text-zinc-400"
            >
              {day}
            </div>
          ))}
        </div>

        {/* カレンダーセル */}
        <div className="grid grid-cols-7 gap-0">
          {calendarCells.map((cell, idx) => {
            const date = new Date(
              year,
              month - 1,
              cell.isCurrentMonth
                ? cell.day
                : cell.isPastMonth
                  ? -startDayOfWeek + 1 + idx
                  : daysInMonth + idx - 41,
            );
            const dateKey = formatJSTDate(date);
            const data = cell.isCurrentMonth
              ? calendarData[dateKey]
              : undefined;
            const isSelected = cell.isCurrentMonth && selectedDay === cell.day;
            const isToday =
              cell.isCurrentMonth &&
              new Date().getDate() === cell.day &&
              new Date().getMonth() === month - 1 &&
              new Date().getFullYear() === year;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (cell.isCurrentMonth) {
                    onDayClick(cell.day);
                  }
                }}
                disabled={!cell.isCurrentMonth}
                className={cn(
                  "flex h-20 flex-col items-start justify-between border-r border-b border-zinc-800 p-1.5 text-left transition-colors",
                  // 行の最後のセルは右ボーダーなし
                  (idx + 1) % 7 === 0 && "border-r-0",
                  // 最後の行は下ボーダーなし
                  idx >= calendarCells.length - 7 && "border-b-0",
                  // 当月の日付
                  cell.isCurrentMonth && [
                    "cursor-pointer",
                    isSelected && "!bg-blue-600/50",
                    isToday && !isSelected && "!bg-accent/30",
                  ],
                  // 当月以外の日付
                  !cell.isCurrentMonth &&
                    "cursor-default bg-zinc-950/50 text-zinc-600",
                  // ヒートマップ背景
                  cell.isCurrentMonth &&
                    data &&
                    data.expense > 0 &&
                    getHeatmapColor(data.expense, maxExpense),
                )}
              >
                {/* 日付番号 */}
                <span
                  className={cn(
                    "text-sm font-semibold",
                    cell.isCurrentMonth ? "text-zinc-200" : "text-zinc-600",
                  )}
                >
                  {cell.day}
                </span>

                {/* 支出ヒートマップ（金額表示） */}
                {cell.isCurrentMonth && data && data.expense > 0 && (
                  <div className="flex w-full flex-col items-end gap-0.5 min-w-0 mt-0.5">
                    <span
                      className="font-mono text-xs font-bold truncate w-full text-right text-red-400"
                      title={`支出: ¥${data.expense.toLocaleString()}`}
                    >
                      -
                      {data.expense >= 100000
                        ? `${(data.expense / 10000).toFixed(0)}万`
                        : data.expense.toLocaleString()}
                    </span>
                    {data.income > 0 && (
                      <span
                        className="text-emerald-400 text-xs font-mono font-semibold truncate w-full text-right"
                        title={`収入: ¥${data.income.toLocaleString()}`}
                      >
                        +{data.income.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
