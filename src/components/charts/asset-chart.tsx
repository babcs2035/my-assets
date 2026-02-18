"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { assetTypeColor, assetTypeLabel, formatCurrency } from "@/lib/utils";

type AssetHistoryEntry = {
  date: string;
  total: number;
  [key: string]: string | number;
};

const assetTypes = ["CASH", "INVESTMENT", "CRYPTO", "POINT"] as const;

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="glass-card p-3 text-xs">
      <p className="mb-2 font-medium text-zinc-300">{label}</p>
      {payload.map(p => (
        <div
          key={p.dataKey}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: p.color }}
            />
            {assetTypeLabel(p.dataKey as (typeof assetTypes)[number])}
          </span>
          <span className="font-mono">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function AssetChart({ data }: { data: AssetHistoryEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-zinc-500">
        推移データがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data}>
        <defs>
          {assetTypes.map(type => (
            <linearGradient
              key={type}
              id={`gradient-${type}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={assetTypeColor(type)}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={assetTypeColor(type)}
                stopOpacity={0}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          stroke="#52525b"
          fontSize={11}
          tickFormatter={v => v.slice(5)}
        />
        <YAxis
          stroke="#52525b"
          fontSize={11}
          tickFormatter={v => `${(Number(v) / 10000).toFixed(0)}万`}
        />
        <Tooltip content={<CustomTooltip />} />
        {assetTypes.map(type => (
          <Area
            key={type}
            type="monotone"
            dataKey={type}
            stackId="1"
            stroke={assetTypeColor(type)}
            fill={`url(#gradient-${type})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
