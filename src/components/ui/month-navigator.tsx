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
import { BACKFILL_START_DATE, formatJSTDate, nowJST } from "@/lib/utils";

/**
 * 年月ナビゲーターコンポーネントである．
 * 収支ページ・入出金明細ページで共通の年月切り替えUI（‹/›ボタン，年・月セレクト，今月ボタン）を提供する．
 */
interface MonthNavigatorProps {
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  onThisMonth: () => void;
  // 移動できる最初の月の 1 日 (YYYY-MM-DD)．集計の起点が後ろの画面だけ指定する
  minDate?: string;
  buttonSize?: "icon" | "icon-sm" | "sm" | "default" | "lg" | null | undefined;
  buttonVariant?:
    | "outline"
    | "ghost"
    | "default"
    | "link"
    | "destructive"
    | null
    | undefined;
}

export function MonthNavigator({
  year,
  month,
  onMonthChange,
  onThisMonth,
  minDate = BACKFILL_START_DATE,
  buttonSize = "icon",
  buttonVariant = "outline",
}: MonthNavigatorProps) {
  // 移動できるのは minDate の月 (既定はバックフィル開始月) から JST の今月までに限る．
  // 制限がないと，前月で開始年より前に出て年の欄が空になり，データのない未来の月にも進めた (TX-8)．
  // 現在の年月は JST で決める（ローカル TZ の getFullYear では JST 日付境界でずれる）
  const nowKey = formatJSTDate(nowJST());
  const maxYear = Number(nowKey.slice(0, 4));
  const maxMonth = Number(nowKey.slice(5, 7));
  const minYear = Number(minDate.slice(0, 4));
  const minMonth = Number(minDate.slice(5, 7));
  // 年月を通し番号にして，範囲の判定と月の繰り上がりを 1 つの比較で扱う
  const toMonthIndex = (y: number, m: number) => y * 12 + (m - 1);
  const minIndex = toMonthIndex(minYear, minMonth);
  const maxIndex = toMonthIndex(maxYear, maxMonth);
  const currentIndex = toMonthIndex(year, month);
  const yearOptions = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => minYear + i,
  );

  // 範囲の外になる年月は端の月に寄せてから親に渡す
  // （例: 2025 年 12 月から年だけ今年に変えると，今月より先になる）
  const changeToClampedMonth = (y: number, m: number) => {
    const index = Math.min(Math.max(toMonthIndex(y, m), minIndex), maxIndex);
    onMonthChange(Math.floor(index / 12), (index % 12) + 1);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className="h-8 w-8"
        onClick={() => changeToClampedMonth(year, month - 1)}
        disabled={currentIndex <= minIndex}
        aria-label="前月"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-2">
        <Select
          value={String(year)}
          onValueChange={v => changeToClampedMonth(Number(v), month)}
        >
          <SelectTrigger size="sm" className="h-9 w-24 sm:w-32" aria-label="年">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map(y => (
              <SelectItem key={y} value={String(y)}>
                {y}年
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(month)}
          onValueChange={v => changeToClampedMonth(year, Number(v))}
        >
          <SelectTrigger size="sm" className="h-9 w-16 sm:w-20" aria-label="月">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <SelectItem
                key={m}
                value={String(m)}
                disabled={
                  toMonthIndex(year, m) < minIndex ||
                  toMonthIndex(year, m) > maxIndex
                }
              >
                {m}月
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className="h-8 w-8"
        onClick={() => changeToClampedMonth(year, month + 1)}
        disabled={currentIndex >= maxIndex}
        aria-label="次月"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={onThisMonth}
      >
        今月
      </Button>
    </div>
  );
}
