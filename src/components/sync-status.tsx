"use client";

import { CheckCircle2, Loader2, Minus, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getLastSyncInfo } from "@/actions/system";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatJSTDate, formatJSTDateTime, nowJST } from "@/lib/utils";

/**
 * 同期状態の型定義である．
 * "aborted" はユーザーが意図的に中止した状態（失敗とは区別して表示する）．
 */
type SyncState = "idle" | "syncing" | "success" | "error" | "aborted";

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
        const info = await getLastSyncInfo();
        const now = nowJST();

        if (!info) {
          setStatus("idle");
          setLastSyncText("未実行");
          return;
        }

        if (info.success === null) {
          setStatus("syncing");
          setLastSyncText("同期中");
          return;
        }

        const lastDateStr = formatJSTDate(new Date(info.date));
        const isToday = formatJSTDate(now) === lastDateStr;

        if (isToday) {
          setStatus(info.success ? "success" : "error");
          setLastSyncText(
            formatJSTDateTime(new Date(info.date)) +
              ` ${info.success ? "完了" : "失敗"}`,
          );
        } else {
          // 現在同期実行中かどうかを判定する (例: 08:00 - 08:10 JST)．
          const lastDateTimeStr = formatJSTDateTime(new Date(info.date));
          const hour = parseInt(
            new Intl.DateTimeFormat("en-US", {
              hour: "2-digit",
              hour12: false,
              timeZone: "Asia/Tokyo",
            }).format(now),
            10,
          );
          const minute = parseInt(
            new Intl.DateTimeFormat("en-US", {
              minute: "2-digit",
              timeZone: "Asia/Tokyo",
            }).format(now),
            10,
          );

          if (hour === 8 && minute < 10) {
            setStatus("syncing");
            setLastSyncText("実行中...");
          } else if ((hour === 8 && minute >= 10) || hour > 8) {
            setStatus(info.success ? "idle" : "error");
            setLastSyncText(
              `${lastDateTimeStr} ${info.success ? "完了" : "失敗"}`,
            );
          } else {
            setStatus("idle");
            setLastSyncText(
              `${lastDateTimeStr} ${info.success ? "完了" : "失敗"}`,
            );
          }
        }
      } catch {
        setStatus("error");
        setLastSyncText("エラー");
      }
    };

    checkSync();

    const handleProviderSyncStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{ status?: SyncState }>;
      if (customEvent.detail?.status === "syncing") {
        setStatus("syncing");
        setLastSyncText("同期中");
        return;
      }
      if (customEvent.detail?.status === "success") {
        setStatus("success");
        setLastSyncText("完了");
        void checkSync();
        return;
      }
      if (customEvent.detail?.status === "error") {
        setStatus("error");
        setLastSyncText("失敗");
        void checkSync();
        return;
      }
      if (customEvent.detail?.status === "aborted") {
        // 中止は失敗とは区別して表示する（ユーザーの意図的な操作）
        setStatus("aborted");
        setLastSyncText("中止");
        void checkSync();
      }
    };

    window.addEventListener("provider-sync-status", handleProviderSyncStatus);

    // 1 分ごとに同期状態を再確認する．
    const interval = setInterval(checkSync, 60000);
    return () => {
      clearInterval(interval);
      window.removeEventListener(
        "provider-sync-status",
        handleProviderSyncStatus,
      );
    };
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
    if (status === "aborted") {
      return <Minus className="h-4 w-4 text-zinc-400" />;
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
    if (status === "aborted") {
      return "border-zinc-700 bg-zinc-800/50 text-zinc-300";
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
    <div className="px-2 py-2 overflow-hidden">
      <div
        className={cn(
          "flex flex-col gap-1 rounded-md border p-2 text-xs transition-colors",
          getStatusColor(),
        )}
      >
        {/* opacity-70 を重ねると idle 状態のコントラストが ~2.3:1 になるため，
            色だけで階調を出す */}
        <span className="font-medium">同期ステータス</span>
        <div className="flex items-center gap-1.5">
          {getStatusIcon()}
          <span className="font-mono font-medium">{lastSyncText}</span>
        </div>
      </div>
    </div>
  );
}
