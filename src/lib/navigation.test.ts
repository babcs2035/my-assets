import { describe, expect, it } from "vitest";
import { isNavHrefActive } from "@/lib/navigation";

describe("isNavHrefActive", () => {
  it("ルートの項目はルートでのみ有効になる", () => {
    expect(isNavHrefActive("/", "/")).toBe(true);
    expect(isNavHrefActive("/accounts", "/")).toBe(false);
  });

  it("同じパスで有効になる", () => {
    expect(isNavHrefActive("/accounts", "/accounts")).toBe(true);
  });

  it("配下のパスで有効になる", () => {
    expect(isNavHrefActive("/accounts/xxx", "/accounts")).toBe(true);
  });

  it("接頭辞が同じだけの別のパスでは有効にならない", () => {
    expect(isNavHrefActive("/accounts-foo", "/accounts")).toBe(false);
  });

  it("basePath を含むパスとは比べない", () => {
    // usePathname() は basePath を除いたパスを返すため，basePath 付きのパスは一致しない
    expect(isNavHrefActive("/my-assets/accounts", "/accounts")).toBe(false);
  });
});
