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

/**
 * 年月ナビゲーターコンポーネントである．
 * 収支ページ・入出金明細ページで共通の年月切り替えUI（‹/›ボタン，年・月セレクト，今月ボタン）を提供する．
 */
interface MonthNavigatorProps {
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  onThisMonth: () => void;
  maxYear?: number;
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
  maxYear,
  buttonSize = "icon",
  buttonVariant = "outline",
}: MonthNavigatorProps) {
  const nowYear = maxYear ?? new Date().getFullYear();
  const yearOptions = Array.from(
    { length: nowYear - 2023 + 2 },
    (_, i) => 2023 + i,
  );

  const changeMonth = (direction: -1 | 1) => {
    let newYear = year;
    let newMonth = month + direction;
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
    onMonthChange(newYear, newMonth);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className="h-8 w-8"
        onClick={() => changeMonth(-1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-2">
        <Select
          value={String(year)}
          onValueChange={v => onMonthChange(Number(v), month)}
        >
          <SelectTrigger size="sm" className="h-9 w-32">
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
          onValueChange={v => onMonthChange(year, Number(v))}
        >
          <SelectTrigger size="sm" className="h-9 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <SelectItem key={m} value={String(m)}>
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
        onClick={() => changeMonth(1)}
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
