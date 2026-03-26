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
      <TabsList className="h-7 w-full max-w-full grid grid-cols-5 p-0.5">
        {UNIFIED_TIME_RANGE_OPTIONS.map(option => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className="h-5 min-w-0 px-1 sm:px-1.5 py-0 text-xs sm:text-sm leading-none"
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
