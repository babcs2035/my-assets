"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

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

export function HoldingTable({
  holdings,
  showDetails = false,
}: HoldingTableProps) {
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey | null;
    direction: "asc" | "desc";
  }>({ key: null, direction: "desc" });

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
          <TableHead className="whitespace-nowrap min-w-[240px]">
            銘柄名
          </TableHead>
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
          <TableHead className="whitespace-nowrap text-right">評価額</TableHead>
          {showDetails && (
            <TableHead className="whitespace-nowrap text-right">
              前日比
            </TableHead>
          )}
          <TableHead
            className="whitespace-nowrap text-right"
            aria-sort={
              sortConfig.key === "gainLoss"
                ? sortConfig.direction === "asc"
                  ? "ascending"
                  : "descending"
                : undefined
            }
          >
            <button
              type="button"
              onClick={() => handleSort("gainLoss")}
              className="mx-auto flex cursor-pointer select-none items-center justify-end gap-0.5 hover:text-zinc-100 transition-colors"
            >
              評価損益
              {sortConfig.key === "gainLoss" &&
                (sortConfig.direction === "desc" ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                ))}
            </button>
          </TableHead>
          <TableHead
            className="whitespace-nowrap text-right"
            aria-sort={
              sortConfig.key === "gainLossRate"
                ? sortConfig.direction === "asc"
                  ? "ascending"
                  : "descending"
                : undefined
            }
          >
            <button
              type="button"
              onClick={() => handleSort("gainLossRate")}
              className="mx-auto flex cursor-pointer select-none items-center justify-end gap-0.5 hover:text-zinc-100 transition-colors"
            >
              損益率
              {sortConfig.key === "gainLossRate" &&
                (sortConfig.direction === "desc" ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                ))}
            </button>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedHoldings.map(h => (
          <TableRow key={h.id}>
            <TableCell className="whitespace-nowrap font-medium text-zinc-200">
              {h.name}
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
                className={`whitespace-nowrap text-right font-mono ${h.dayBeforeRatio != null && h.dayBeforeRatio >= 0 ? "text-emerald-400" : "text-zinc-500"}`}
              >
                {h.dayBeforeRatio != null
                  ? `${h.dayBeforeRatio >= 0 ? "+" : ""}${h.dayBeforeRatio.toLocaleString("ja-JP")}%`
                  : "—"}
              </TableCell>
            )}
            <TableCell
              className={`whitespace-nowrap text-right font-mono ${h.gainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {h.gainLoss >= 0 && "+"}
              {formatCurrency(h.gainLoss)}
            </TableCell>
            <TableCell
              className={`whitespace-nowrap text-right font-mono ${h.gainLossRate >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {h.gainLossRate >= 0 && "+"}
              {h.gainLossRate.toFixed(2)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
