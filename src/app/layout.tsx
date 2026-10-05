import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import logger from "@/lib/logger";

/**
 * 基本となるフォント設定として Inter を使用する．
 */
const inter = Inter({ subsets: ["latin"] });

/**
 * Web アプリケーションのメタデータを定義する定数である．
 */
export const metadata: Metadata = {
  title: "My Assets",
  description: "Personal Asset Management Dashboard",
  manifest: "/my-assets/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "My Assets",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/my-assets/icon.svg",
    shortcut: "/my-assets/icon.svg",
    apple: "/my-assets/icon.svg",
  },
};

/**
 * 画面の表示領域に関する設定 (ビューポート) を定義する定数である．
 */
export const viewport: Viewport = {
  themeColor: "#18181b", // manifest.jsonに合わせる
  width: "device-width",
  initialScale: 1,
  // maximumScale / userScalable: false は WCAG 1.4.4（ズーム可能）に
  // 抵触するため設定しない
  viewportFit: "cover", // Notch などセーフエリア対応
};

/**
 * アプリケーション全体のレイアウトを規定するルートレイアウトコンポーネントである．
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  logger.info("🏗️ Rendering RootLayout...");

  return (
    <html lang="ja" className="dark">
      <body className={inter.className}>
        {/* キーボードユーザー向けスキップリンク（フォーカス時のみ表示） */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-zinc-800 focus:px-3 focus:py-2 focus:text-sm focus:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
        >
          メインコンテンツへスキップ
        </a>
        <SidebarProvider>
          <div className="flex min-h-svh w-full bg-background">
            {/* サイドバーコンポーネント */}
            <AppSidebar />

            <SidebarInset>
              {/* モバイル表示用のヘッダー部分．
                  viewportFit: cover と black-translucent ではステータスバーの下まで描画されるため，
                  上端の safe-area 分だけ余白を取り，その分だけ高さも増やす */}
              <header className="sticky top-0 z-10 flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 bg-background px-3 pt-[env(safe-area-inset-top)] md:hidden border-b border-border/40 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <SidebarTrigger className="-ml-1 h-10 w-10" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <div className="font-semibold text-sm">My Assets</div>
              </header>

              {/* メインコンテンツエリア（スキップリンクの目的地。
                  sticky ヘッダー 48px と上端の safe-area の分だけ下方にずらす）．
                  下端はホームインジケーター，md 以上の上端はヘッダーがないためステータスバーと重ならないよう safe-area を足す */}
              <div
                id="main-content"
                tabIndex={-1}
                className="flex flex-1 flex-col gap-4 p-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-8 md:pt-[calc(2rem+env(safe-area-inset-top))] md:pb-[calc(2rem+env(safe-area-inset-bottom))] scroll-mt-[calc(3.5rem+env(safe-area-inset-top))] outline-none"
              >
                {/* children を Suspense で包まない．包むとストリーミングが先に始まり，
                    ページ内の notFound() が HTTP 200 になる（口座詳細の soft 404）．
                    データを待つページは，それぞれページ内に Suspense を持つ */}
                {children}
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>

        {/* トースト通知用のコンポーネント */}
        <Toaster />
      </body>
    </html>
  );
}
