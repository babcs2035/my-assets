"use client";

import {
  ArrowDownUp,
  ArrowLeftRight,
  Building2,
  LayoutDashboard,
  Settings,
  TrendingUp,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { SyncStatus } from "@/components/sync-status";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * サイドバーのナビゲーション項目を定義する配列である．
 */
const navItems = [
  {
    href: "/",
    label: "ダッシュボード",
    icon: LayoutDashboard,
  },
  {
    href: "/assets",
    label: "資産",
    icon: TrendingUp,
  },
  {
    href: "/income-expense",
    label: "収支",
    icon: ArrowLeftRight,
  },
  {
    href: "/transactions",
    label: "入出金明細",
    icon: ArrowDownUp,
  },
  {
    href: "/accounts",
    label: "口座管理",
    icon: Building2,
  },
  {
    href: "/settings",
    label: "設定",
    icon: Settings,
  },
];

/**
 * アプリケーションの共通サイドバーコンポーネントである．
 * ナビゲーションおよび同期状態 (SyncStatus) を表示する．
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const basePath = "/my-assets";

  /**
   * 指定されたパスが現在のパスと一致するか，またはその配下であるかを判定する関数である．
   */
  const isActive = (href: string) => {
    const fullPath =
      href === "/" ? basePath : `${basePath}${href}`.replace(/\/$/, "");

    // ルートパスの場合の特殊判定を行う．
    if (href === "/") {
      return pathname === "/my-assets" || pathname === "/my-assets/";
    }
    return pathname.startsWith(fullPath);
  };

  return (
    <Sidebar collapsible="icon" {...props} className="border-r-0">
      {/* サイドバーヘッダー部分 */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                  <Image
                    src={`${basePath}/icon.svg`}
                    alt="My Assets"
                    width={32}
                    height={32}
                    className="size-8"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">My Assets</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ナビゲーションメニューエリア */}
      <SidebarContent>
        <SidebarMenu>
          {navItems.map(item => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={isActive(item.href)}
                tooltip={item.label}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      {/* サイドバーフッター部分：同期状態を表示する． */}
      <SidebarFooter>
        <div className="p-2">
          <SyncStatus />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
