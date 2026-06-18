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
  avgCostBasis: number;
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
          <TableHead className="min-w-[240px]">銘柄名</TableHead>
          <TableHead className="w-[100px]">口座</TableHead>
          <TableHead className="text-right">保有数</TableHead>
          {showDetails && (
            <>
              <TableHead className="text-right">平均取得単価</TableHead>
              <TableHead className="text-right">基準価額</TableHead>
            </>
          )}
          <TableHead className="text-right">評価額</TableHead>
          {showDetails && <TableHead className="text-right">前日比</TableHead>}
          <TableHead
            className="text-right cursor-pointer select-none hover:text-zinc-100 transition-colors"
            onClick={() => handleSort("gainLoss")}
          >
            <span className="inline-flex items-center gap-0.5">
              評価損益
              {sortConfig.key === "gainLoss" &&
                (sortConfig.direction === "desc" ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                ))}
            </span>
          </TableHead>
          <TableHead
            className="text-right cursor-pointer select-none hover:text-zinc-100 transition-colors"
            onClick={() => handleSort("gainLossRate")}
          >
            <span className="inline-flex items-center gap-0.5">
              損益率
              {sortConfig.key === "gainLossRate" &&
                (sortConfig.direction === "desc" ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                ))}
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedHoldings.map(h => (
          <TableRow key={h.id}>
            <TableCell className="font-medium text-zinc-200">
              {h.name}
            </TableCell>
            <TableCell className="text-zinc-400 text-sm">{h.account}</TableCell>
            <TableCell className="text-right font-mono text-zinc-300">
              {h.quantity.toLocaleString()}
            </TableCell>
            {showDetails && (
              <>
                <TableCell className="text-right font-mono text-zinc-300">
                  {formatCurrency(h.avgCostBasis)}
                </TableCell>
                <TableCell className="text-right font-mono text-zinc-300">
                  {formatCurrency(h.unitPrice)}
                </TableCell>
              </>
            )}
            <TableCell className="text-right font-mono font-medium text-zinc-100">
              {formatCurrency(h.valuation)}
            </TableCell>
            {showDetails && (
              <TableCell
                className={`text-right font-mono ${h.dayBeforeRatio != null && h.dayBeforeRatio >= 0 ? "text-emerald-400" : "text-zinc-500"}`}
              >
                {h.dayBeforeRatio != null
                  ? `${h.dayBeforeRatio >= 0 ? "+" : ""}${h.dayBeforeRatio.toLocaleString()}%`
                  : "—"}
              </TableCell>
            )}
            <TableCell
              className={`text-right font-mono ${h.gainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {h.gainLoss >= 0 && "+"}
              {formatCurrency(h.gainLoss)}
            </TableCell>
            <TableCell
              className={`text-right font-mono ${h.gainLossRate >= 0 ? "text-emerald-400" : "text-red-400"}`}
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
