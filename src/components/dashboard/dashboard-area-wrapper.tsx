"use client";

import { DashboardAreaChart } from "./dashboard-charts";

interface DashboardAreaWrapperProps {
  data: Array<{
    date: string;
    total: number;
    CASH: number;
    INVESTMENT: number;
    CRYPTO: number;
    POINT: number;
    LIABILITY: number;
  }>;
}

export function DashboardAreaWrapper({ data }: DashboardAreaWrapperProps) {
  return <DashboardAreaChart data={data} />;
}
