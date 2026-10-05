"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UNIFIED_TIME_RANGE_OPTIONS,
  type UnifiedTimeRange,
} from "@/lib/chart-time-range";

type Props = {
  value: UnifiedTimeRange;
  onChange: (value: UnifiedTimeRange) => void;
  className?: string;
};

export function UnifiedTimeRangeTabs({ value, onChange, className }: Props) {
  return (
    <Tabs
      value={value}
      onValueChange={next => onChange(next as UnifiedTimeRange)}
      className={className}
    >
      {/* タッチ端末ではトリガーを 44px にし，リストは上下の p-0.5 を足して 48px にする．
          リストの基底の group-data:h-9 は詳細度が高いため，同じ条件を重ねて上書きする */}
      <TabsList className="h-9 w-full max-w-full grid grid-cols-5 p-0.5 pointer-coarse:group-data-[orientation=horizontal]/tabs:h-12">
        {UNIFIED_TIME_RANGE_OPTIONS.map(option => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className="h-7 min-w-0 px-1 sm:px-1.5 py-0 text-xs sm:text-sm leading-none pointer-coarse:h-11"
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
