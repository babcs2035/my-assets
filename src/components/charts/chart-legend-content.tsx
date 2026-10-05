"use client";

import type { DefaultLegendContentProps } from "recharts";

// recharts 3 の既定の凡例はアイコンに "<値> legend icon" という英語の aria-label を必ず付け，
// formatter でも prop でも消せないため，アイコンを読み上げ対象から外した凡例に置き換える．
// 見た目の差を小さくするため，文字色とアイコンの形 (Area は線，Bar は四角) は既定に合わせている．
export function ChartLegendContent({
  payload,
  formatter,
}: DefaultLegendContentProps) {
  if (!payload) return null;
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {payload.map((entry, index) => {
        if (entry.type === "none") return null;
        return (
          <li
            key={String(entry.dataKey ?? entry.value ?? index)}
            className="flex items-center gap-1"
            style={{ color: entry.color }}
          >
            <span
              aria-hidden="true"
              className={
                entry.type === "line" || entry.type === "plainline"
                  ? "inline-block h-0.5 w-3.5"
                  : "inline-block size-3.5 rounded-sm"
              }
              style={{ background: entry.color }}
            />
            <span>
              {formatter ? formatter(entry.value, entry, index) : entry.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
