"use client";

import { Slot } from "@radix-ui/react-slot";
import { PanelLeft } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// --- Context ---

type SidebarContext = {
  expanded: boolean;
  toggleExpanded: () => void;
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContext | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

import { usePathname } from "next/navigation";

// --- Provider ---

export function SidebarProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Default expanded on desktop
  const [expanded, setExpanded] = React.useState(true);
  const [isMobile, setIsMobile] = React.useState(false);
  const [openMobile, setOpenMobile] = React.useState(false);
  const _pathname = usePathname();

  // Mobile detection logic
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    };
    // Initial check
    checkMobile();

    // Listener
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Auto-close mobile sidebar on pathname change
  React.useEffect(() => {
    setOpenMobile(false);
  }, []);

  const toggleExpanded = React.useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        expanded,
        toggleExpanded,
        isMobile,
        openMobile,
        setOpenMobile,
      }}
    >
      <TooltipProvider delayDuration={0}>
        <div
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full text-zinc-950 dark:text-zinc-50",
            className,
          )}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

// --- Sidebar Main Component ---

export function Sidebar({
  className,
  children,
  collapsible = "icon",
  ...props
}: React.ComponentProps<"aside"> & {
  collapsible?: "icon" | "offcanvas" | "none";
}) {
  const { isMobile, openMobile, setOpenMobile, expanded } = useSidebar();

  // Mobile: Use Sheet (Overlay)
  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          className="w-[280px] p-0 bg-zinc-950 text-zinc-50 border-r border-zinc-800"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Sticky Sidebar
  return (
    <aside
      className={cn(
        "group sticky top-0 z-30 hidden h-svh flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-50 transition-[width] duration-300 ease-in-out md:flex",
        expanded ? "w-64" : "w-[60px]", // 256px vs 60px
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

// ... (Sub Components keep structurally same until MenuButton)

export function SidebarHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col p-2", className)} {...props}>
      {children}
    </div>
  );
}

export function SidebarContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 py-2 group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarFooter({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col p-2", className)} {...props}>
      {children}
    </div>
  );
}

export function SidebarMenu({
  className,
  children,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul className={cn("flex w-full flex-col gap-1", className)} {...props}>
      {children}
    </ul>
  );
}

export function SidebarMenuItem({
  className,
  children,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li className={cn("relative", className)} {...props}>
      {children}
    </li>
  );
}

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  size = "default",
  tooltip,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  size?: "default" | "sm" | "lg";
  tooltip?: string | React.ComponentProps<any>;
}) {
  const Comp = asChild ? Slot : "button";
  const { expanded, isMobile } = useSidebar();

  // Tooltip logic for collapsed state
  const showTooltip = !expanded && !isMobile && tooltip;

  const buttonContent = (
    <Comp
      data-active={isActive}
      className={cn(
        "flex w-full items-center gap-2 rounded-md p-2 text-sm font-medium transition-colors hover:bg-zinc-800 hover:text-zinc-50 outline-none ring-zinc-950 focus-visible:ring-2",
        isActive && "bg-zinc-800 text-zinc-50 font-semibold",
        // Collapsed state: Center items, Hide text spans
        !expanded && !isMobile && "justify-center px-2",
        !expanded && !isMobile && "[&_span]:hidden",
        // Force icon sizes
        "[&>svg]:size-5 [&>svg]:shrink-0",
        // Exception for the first child div (SidebarHeader case) - allow it to size itself but center it
        !expanded && !isMobile && "[&>div]:mx-auto",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );

  if (showTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          className="hidden md:block bg-zinc-900 text-zinc-50 border-zinc-800"
        >
          {typeof tooltip === "string" ? tooltip : tooltip?.children}
        </TooltipContent>
      </Tooltip>
    );
  }

  return buttonContent;
}

export function SidebarRail({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleExpanded, expanded } = useSidebar();

  return (
    <button
      onClick={toggleExpanded}
      className={cn(
        "absolute -right-3 top-1/2 z-40 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-400 shadow-sm hover:bg-zinc-800 hover:text-zinc-50 transition-all duration-200 md:flex hidden",
        className,
      )}
      aria-label="Toggle Sidebar"
      {...props}
    >
      <PanelLeft
        className={cn(
          "h-3 w-3 transition-transform",
          !expanded && "rotate-180",
        )}
      />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { setOpenMobile } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("md:hidden", className)}
      onClick={e => {
        setOpenMobile(true);
        onClick?.(e);
      }}
      {...props}
    >
      <PanelLeft className="h-5 w-5" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

export function SidebarInset({
  className,
  children,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "flex min-h-svh flex-1 flex-col bg-background transition-all duration-300 ease-in-out w-full min-w-0",
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
}

// Stub components for compatibility if needed, though most seem unused
export function SidebarGroup({
  className,
  children,
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-2 p-2", className)}>{children}</div>
  );
}
export function SidebarGroupLabel({
  className,
  children,
}: React.ComponentProps<"div">) {
  const { expanded } = useSidebar();
  if (!expanded) return null;
  return (
    <div className={cn("px-2 text-xs font-medium text-zinc-500", className)}>
      {children}
    </div>
  );
}
export function SidebarGroupContent({
  className,
  children,
}: React.ComponentProps<"div">) {
  return <div className={cn("w-full text-sm", className)}>{children}</div>;
}
export function SidebarMenuSub({
  className,
  children,
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
        className,
      )}
    >
      {children}
    </ul>
  );
}
export function SidebarMenuSubItem({ ...props }: React.ComponentProps<"li">) {
  return <li {...props} />;
}
export function SidebarMenuSubButton({ ...props }: React.ComponentProps<"a">) {
  return <a {...props} />; // Simplified stub
}
