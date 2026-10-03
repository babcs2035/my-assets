// src/actions/providers.ts の手動同期が，同期の終わりを待たずに返ることを検証する．
// Server Action はクライアントで 1 件ずつ送られるので，syncProvider が同期の終わりまで待つと，
// 中止や画面の読み込みが後ろで待たされる（U-2）．MoneyForward に触れないよう，scraper と DB をモックする
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  runMfScraper: vi.fn(),
  abortMfScraper: vi.fn(),
  acquireSyncLock: vi.fn(),
  releaseSyncLock: vi.fn(),
}));

// 本物の logger は pino-pretty の worker を起動するので，テストでは使わない
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { findUnique: mocks.findUnique } },
}));
// revalidatePath は request の外では呼べないので，呼ばれないようにする
vi.mock("@/lib/revalidate", () => ({
  revalidateSettingsAndDashboardPages: vi.fn(),
  revalidateSettingsPage: vi.fn(),
}));
vi.mock("@/lib/sync-lock", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/sync-lock")>()),
  acquireSyncLock: mocks.acquireSyncLock,
  releaseSyncLock: mocks.releaseSyncLock,
}));
vi.mock("@/scraper/mf-scraper", () => ({
  runMfScraper: mocks.runMfScraper,
  abortMfScraper: mocks.abortMfScraper,
}));

const PROVIDER_ID = "provider-1";

/**
 * Provider 行の同期の列である．acquireSyncLock と releaseSyncLock のモックが，本物と同じ条件で書き換える
 */
let providerRow: { lastSyncAt: Date | null; lastSyncSuccess: boolean | null };

/**
 * runMfScraper を，テストから終わらせるまで終わらない Promise にする関数である．
 * 渡された AbortSignal も返し，中止が scraper に届いたかを確かめられるようにする
 */
function holdScraperUntilSettled() {
  const scraper: {
    resolve: () => void;
    reject: (error: Error) => void;
    signal: AbortSignal | undefined;
  } = { resolve: () => {}, reject: () => {}, signal: undefined };
  mocks.runMfScraper.mockImplementation(
    (_providerName: string, signal: AbortSignal) => {
      scraper.signal = signal;
      return new Promise<void>((resolve, reject) => {
        scraper.resolve = resolve;
        scraper.reject = reject;
      });
    },
  );
  return scraper;
}

async function importProviderActions() {
  // activeSyncControllers はモジュールの変数なので，テストごとに読み込み直して前のテストの同期を残さない
  vi.resetModules();
  return import("@/actions/providers");
}

beforeEach(() => {
  vi.clearAllMocks();
  providerRow = { lastSyncAt: null, lastSyncSuccess: true };
  mocks.findUnique.mockImplementation(async () => ({
    id: PROVIDER_ID,
    name: "MF_Main",
    type: "mf",
    ...providerRow,
  }));
  mocks.acquireSyncLock.mockImplementation(async () => {
    const lockedAt = new Date();
    providerRow = { lastSyncAt: lockedAt, lastSyncSuccess: null };
    return lockedAt;
  });
  mocks.releaseSyncLock.mockImplementation(
    async (_id: string, lockedAt: Date, success: boolean) => {
      const isOwnLock =
        providerRow.lastSyncSuccess === null &&
        providerRow.lastSyncAt?.getTime() === lockedAt.getTime();
      if (isOwnLock) {
        providerRow = { lastSyncAt: new Date(), lastSyncSuccess: success };
      }
      return isOwnLock;
    },
  );
  mocks.abortMfScraper.mockResolvedValue(undefined);
});

describe("syncProvider", () => {
  it("同期の終わりを待たずに印を返し，終わるまで getManualSyncResult は running を返す", async () => {
    const scraper = holdScraperUntilSettled();
    const { syncProvider, getManualSyncResult } = await importProviderActions();

    const lockedAt = await syncProvider(PROVIDER_ID);

    expect(mocks.runMfScraper).toHaveBeenCalledWith(
      "MF_Main",
      expect.any(AbortSignal),
      { mode: "manual" },
    );
    expect(await getManualSyncResult(PROVIDER_ID, lockedAt)).toBe("running");

    scraper.resolve();
    await vi.waitFor(() =>
      expect(mocks.releaseSyncLock).toHaveBeenCalledWith(
        PROVIDER_ID,
        lockedAt,
        true,
      ),
    );
    expect(await getManualSyncResult(PROVIDER_ID, lockedAt)).toBe("success");
  });

  it("同期の実行中に abortSyncProvider が終わり，scraper に中止が届く", async () => {
    const scraper = holdScraperUntilSettled();
    const { syncProvider, abortSyncProvider, getManualSyncResult } =
      await importProviderActions();
    const lockedAt = await syncProvider(PROVIDER_ID);

    // scraper は終わっていないが，中止の Server Action はそれを待たずに終わる
    await expect(abortSyncProvider(PROVIDER_ID)).resolves.toEqual({
      success: true,
    });
    expect(scraper.signal?.aborted).toBe(true);
    expect(mocks.abortMfScraper).toHaveBeenCalledWith(PROVIDER_ID);
    expect(mocks.releaseSyncLock).toHaveBeenCalledWith(
      PROVIDER_ID,
      lockedAt,
      false,
    );
    expect(await getManualSyncResult(PROVIDER_ID, lockedAt)).toBe("failed");

    // 本物の abortMfScraper はブラウザを閉じ，scraper は例外で終わる．ロックは外れているので結果は書き換わらない
    scraper.reject(new Error("Browser closed"));
    await vi.waitFor(() =>
      expect(mocks.releaseSyncLock).toHaveBeenCalledTimes(2),
    );
    expect(providerRow.lastSyncSuccess).toBe(false);
  });

  it("scraper が失敗すると，getManualSyncResult は failed を返す", async () => {
    const scraper = holdScraperUntilSettled();
    const { syncProvider, getManualSyncResult } = await importProviderActions();
    const lockedAt = await syncProvider(PROVIDER_ID);

    scraper.reject(new Error("Login failed"));
    await vi.waitFor(() =>
      expect(mocks.releaseSyncLock).toHaveBeenCalledWith(
        PROVIDER_ID,
        lockedAt,
        false,
      ),
    );
    expect(await getManualSyncResult(PROVIDER_ID, lockedAt)).toBe("failed");
  });
});
