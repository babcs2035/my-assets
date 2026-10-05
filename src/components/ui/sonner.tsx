"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-right"
      // 既定の "Notifications" は英語で読み上げられるため日本語にする (sonner が後ろにショートカット表記を足す)
      containerAriaLabel="通知"
      // トーストは position: fixed で body の safe-area の余白が効かないため，sonner の既定 (24px / 16px) に
      // ホームインジケーターと横向きのノッチの分を足す．sonner は文字列をそのまま CSS 変数に入れる
      offset={{
        bottom: "calc(24px + env(safe-area-inset-bottom))",
        right: "calc(24px + env(safe-area-inset-right))",
      }}
      mobileOffset={{
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        left: "calc(16px + env(safe-area-inset-left))",
        right: "calc(16px + env(safe-area-inset-right))",
      }}
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      {...props}
    />
  );
};

export { Toaster };
