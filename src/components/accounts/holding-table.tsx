"use client";

import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatSignedCurrency } from "@/lib/utils";

type Holding = {
  id: string;
  name: string;
  account: string;
  quantity: number;
  acquisitionCost: number;
  unitPrice: number;
  valuation: number;
  dayBeforeRatio: number | null;
  gainLoss: number;
  gainLossRate: number;
};

type HoldingTableProps = {
  holdings: Holding[];
  showDetails?: boolean;
};

type SortKey = "valuation" | "gainLoss" | "gainLossRate";

type SortConfig = {
  key: SortKey | null;
  direction: "asc" | "desc";
};

/**
 * 並べ替えできる列の見出しである．
 * 並べ替えていない列にもアイコンを出さないと，押せる列だと気付けない (ACC-18)
 */
function SortableHead({
  label,
  sortKey,
  sortConfig,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortConfig.key === sortKey;
  return (
    <TableHead
      className="whitespace-nowrap text-right"
      aria-sort={
        isActive
          ? sortConfig.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="ml-auto flex cursor-pointer select-none items-center justify-end gap-0.5 hover:text-zinc-100 transition-colors pointer-coarse:min-h-11"
      >
        {label}
        {isActive ? (
          sortConfig.direction === "desc" ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-zinc-500" aria-hidden />
        )}
      </button>
    </TableHead>
  );
}

export function HoldingTable({
  holdings,
  showDetails = false,
}: HoldingTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: "desc",
  });

  const sortedHoldings = useMemo(() => {
    if (!sortConfig.key) return holdings;
    return [...holdings].sort((a, b) => {
      const aVal =
        sortConfig.key === "valuation"
          ? a.valuation
          : sortConfig.key === "gainLoss"
            ? a.gainLoss
            : a.gainLossRate;
      const bVal =
        sortConfig.key === "valuation"
          ? b.valuation
          : sortConfig.key === "gainLoss"
            ? b.gainLoss
            : b.gainLossRate;
      const mul = sortConfig.direction === "asc" ? 1 : -1;
      return (aVal - bVal) * mul;
    });
  }, [holdings, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="whitespace-nowrap">銘柄名</TableHead>
          <TableHead className="whitespace-nowrap w-[100px]">口座</TableHead>
          <TableHead className="whitespace-nowrap text-right">保有数</TableHead>
          {showDetails && (
            <>
              <TableHead className="whitespace-nowrap text-right">
                取得価額
              </TableHead>
              <TableHead className="whitespace-nowrap text-right">
                基準価額
              </TableHead>
            </>
          )}
          <SortableHead
            label="評価額"
            sortKey="valuation"
            sortConfig={sortConfig}
            onSort={handleSort}
          />
          {showDetails && (
            <TableHead className="whitespace-nowrap text-right">
              前日比
            </TableHead>
          )}
          <SortableHead
            label="評価損益"
            sortKey="gainLoss"
            sortConfig={sortConfig}
            onSort={handleSort}
          />
          <SortableHead
            label="損益率"
            sortKey="gainLossRate"
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedHoldings.map(h => (
          <TableRow key={h.id}>
            {/* 銘柄名は長いものが多く，列に min-width を付けると狭い画面で表が大きく横にはみ出すため，省略して全文は title で見せる (ACC-17) */}
            <TableCell className="font-medium text-zinc-200">
              <span className="block max-w-[220px] truncate" title={h.name}>
                {h.name}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap text-zinc-400 text-sm">
              {h.account}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right font-mono text-zinc-300">
              {/* 暗号資産の数量は小数点多目が必要なため桁数を拡大する */}
              {h.quantity.toLocaleString("ja-JP", {
                maximumFractionDigits: 8,
              })}
            </TableCell>
            {showDetails && (
              <>
                <TableCell className="whitespace-nowrap text-right font-mono font-medium text-zinc-100">
                  {formatCurrency(h.acquisitionCost)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono text-zinc-300">
                  {formatCurrency(h.unitPrice)}
                </TableCell>
              </>
            )}
            <TableCell className="whitespace-nowrap text-right font-mono font-medium text-zinc-100">
              {formatCurrency(h.valuation)}
            </TableCell>
            {showDetails && (
              <TableCell
                className={`whitespace-nowrap text-right font-mono ${
                  h.dayBeforeRatio == null || h.dayBeforeRatio === 0
                    ? "text-zinc-400"
                    : h.dayBeforeRatio > 0
                      ? "text-emerald-400"
                      : "text-red-400"
                }`}
              >
                {/* 前回の履歴がない銘柄は null になる．0 と区別して「—」を出す */}
                {h.dayBeforeRatio != null
                  ? `${h.dayBeforeRatio > 0 ? "+" : ""}${h.dayBeforeRatio.toFixed(2)}%`
                  : "—"}
              </TableCell>
            )}
            <TableCell
              className={`whitespace-nowrap text-right font-mono ${h.gainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {formatSignedCurrency(h.gainLoss)}
            </TableCell>
            {/* 取得価額が 0 の銘柄 (ポイント運用や株式分割の端数など) は損益率を計算できず，
                MoneyForward は 0 を返す．緑の「+0.00%」だと損益ゼロに見えるので「—」を出す (ACC-14) */}
            <TableCell
              className={`whitespace-nowrap text-right font-mono ${
                h.acquisitionCost === 0
                  ? "text-zinc-400"
                  : h.gainLossRate >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
              }`}
            >
              {h.acquisitionCost === 0
                ? "—"
                : `${h.gainLossRate >= 0 ? "+" : ""}${h.gainLossRate.toFixed(2)}%`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
