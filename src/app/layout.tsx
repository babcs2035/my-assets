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
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * アプリケーション全体のレイアウトを規定するルートレイアウトコンポーネントである．
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  console.log("🏗️ Rendering RootLayout...");

  return (
    <html lang="ja" className="dark">
      <body className={inter.className}>
        <SidebarProvider>
          <div className="flex min-h-svh w-full bg-background">
            {/* サイドバーコンポーネント */}
            <AppSidebar />

            <SidebarInset>
              {/* モバイル表示用のヘッダー部分 */}
              <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 bg-background px-3 md:hidden border-b border-border/40 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <SidebarTrigger className="-ml-1 h-8 w-8" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <div className="font-semibold text-sm">My Assets</div>
              </header>

              {/* メインコンテンツエリア */}
              <div className="flex flex-1 flex-col gap-4 p-4 pt-2 md:p-8">
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
