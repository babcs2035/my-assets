"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getLastSyncTime } from "@/actions/system";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * 同期状態の型定義である．
 */
type SyncState = "idle" | "syncing" | "success" | "error";

/**
 * システムの同期状態を表示するコンポーネントである．
 * サイドバー内に配置され，最終同期時刻や現在のステータスをアイコンとテキストで示す．
 */
export function SyncStatus() {
  const [status, setStatus] = useState<SyncState>("idle");
  const [lastSyncText, setLastSyncText] = useState<string>("--:--");
  const { expanded, isMobile } = useSidebar();

  useEffect(() => {
    /**
     * 最新の同期状態を取得し，ステータスを更新する関数である．
     */
    const checkSync = async () => {
      try {
        const lastSync = await getLastSyncTime();
        const now = new Date();

        if (!lastSync) {
          setStatus("idle");
          setLastSyncText("未実行");
          return;
        }

        const last = new Date(lastSync);
        const isToday =
          now.getFullYear() === last.getFullYear() &&
          now.getMonth() === last.getMonth() &&
          now.getDate() === last.getDate();

        if (isToday) {
          setStatus("success");
          setLastSyncText(
            `${last.getHours().toString().padStart(2, "0")}:${last
              .getMinutes()
              .toString()
              .padStart(2, "0")} 完了`,
          );
        } else {
          // 現在同期実行中かどうかを判定する (例: 08:00 - 08:10)．
          const hour = now.getHours();
          const minute = now.getMinutes();

          if (hour === 8 && minute < 10) {
            setStatus("syncing");
            setLastSyncText("実行中...");
          } else if (hour >= 8 || (hour === 7 && minute > 55)) {
            setStatus("error");
            setLastSyncText("未実行");
          } else {
            setStatus("idle");
            setLastSyncText("待機中");
          }
        }
      } catch (error) {
        console.error("❌ Failed to check sync status:", error);
        setStatus("error");
        setLastSyncText("エラー");
      }
    };

    checkSync();
    // 1 分ごとに同期状態を再確認する．
    const interval = setInterval(checkSync, 60000);
    return () => clearInterval(interval);
  }, []);

  /**
   * 現在のステータスに応じたアイコンを取得する．
   */
  const getStatusIcon = () => {
    if (status === "syncing") {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    }
    if (status === "success") {
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    }
    if (status === "error") {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return <CheckCircle2 className="h-4 w-4 text-zinc-500" />;
  };

  /**
   * 現在のステータスに応じたカラー情報を取得する．
   */
  const getStatusColor = () => {
    if (status === "syncing") {
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
    }
    if (status === "success") {
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    }
    if (status === "error") {
      return "border-red-500/30 bg-red-500/10 text-red-400";
    }
    return "border-zinc-800 bg-zinc-900/50 text-zinc-500";
  };

  // サイドバーが閉じられている ( collapsed ) 時の表示内容である．
  if (!expanded && !isMobile) {
    return (
      <div className="flex justify-center py-2">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border transition-colors cursor-help",
                  getStatusColor().split(" ").slice(0, 2).join(" "),
                )}
              >
                {getStatusIcon()}
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-zinc-900 border-zinc-800 text-zinc-50"
            >
              <p className="text-xs font-medium">同期: {lastSyncText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // サイドバーが開いている時の通常表示内容である．
  return (
    <div className="px-2 py-2">
      <div
        className={cn(
          "flex items-center justify-between rounded-md border p-2 text-xs transition-colors",
          getStatusColor(),
        )}
      >
        <span className="font-medium opacity-70">同期ステータス</span>
        <div className="flex items-center gap-1.5">
          {getStatusIcon()}
          <span className="font-mono font-medium">{lastSyncText}</span>
        </div>
      </div>
    </div>
  );
}
