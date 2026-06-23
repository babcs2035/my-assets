"use server";

import type { AssetAnalysis } from "@prisma/client";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { assetTypeLabel, formatCurrency, nowJST } from "@/lib/utils";

/**
 * 分析結果をデータベースに保存する際の分析日時を取得する．
 * 環境変数 ANALYSIS_DATE が設定されていればそちらを優先し，なければ現在時刻 (JST) を返す．
 */
function getAnalysisDate(): Date {
  if (process.env.ANALYSIS_DATE) {
    return new Date(process.env.ANALYSIS_DATE);
  }
  return nowJST();
}

/**
 * 分析結果の型定義である．
 */
export type AnalysisResult = Omit<
  AssetAnalysis,
  "createdAt" | "updatedAt" | "prompt" | "analysisDate"
> & {
  createdAt: Date;
  updatedAt: Date;
  prompt?: string | null;
  analysisDate: Date;
};

/**
 * LLM による資産分析を実行するサーバーアクションである．
 * データベースから資産データを取得し，llama-server に送信して分析結果を生成・保存する．
 */
export async function runAssetAnalysis() {
  const now = nowJST();
  logger.info("[Analysis] Starting asset analysis.");

  try {
    // ── 1. 資産データの取得 ──────────────────────────────

    // 現在の残高（メインアカウント名・サブアカウント名・資産タイプ含む）
    const subAccounts = await prisma.subAccount.findMany({
      where: { isHidden: false },
      include: {
        mainAccount: { select: { label: true } },
        holdings: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    // 直近 30 日の残高推移
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const balanceHistories = await prisma.balanceHistory.findMany({
      where: {
        subAccount: { isHidden: false },
        date: { gte: thirtyDaysAgo, lte: now },
      },
      orderBy: { date: "asc" },
    });

    // 保有銘柄一覧
    const holdings = await prisma.holding.findMany({
      where: { subAccount: { isHidden: false } },
      include: {
        subAccount: {
          include: {
            mainAccount: { select: { label: true } },
          },
        },
      },
    });

    // 今月の収支（カテゴリ情報付き）
    const currentMonth = new Date(now);
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const currentMonthTransactions = await prisma.transaction.findMany({
      where: {
        date: { gte: currentMonth, lt: nextMonth },
        subAccount: { isHidden: false },
        isTransfer: false,
      },
      include: {
        subCategory: { include: { mainCategory: true } },
      },
    });

    // 先月の収支（比較用）
    const prevMonthStart = new Date(currentMonth);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    const prevMonthEnd = new Date(currentMonth);

    const prevMonthTransactions = await prisma.transaction.findMany({
      where: {
        date: { gte: prevMonthStart, lt: prevMonthEnd },
        subAccount: { isHidden: false },
        isTransfer: false,
      },
      include: {
        subCategory: { include: { mainCategory: true } },
      },
    });

    // 過去 30 日間の入出金明細
    const past30DaysTransactions = await prisma.transaction.findMany({
      where: {
        date: { gte: thirtyDaysAgo, lte: now },
        subAccount: { isHidden: false },
        isTransfer: false,
      },
      include: {
        subCategory: { include: { mainCategory: true } },
        subAccount: {
          include: {
            mainAccount: { select: { label: true } },
          },
        },
      },
      orderBy: { date: "desc" },
    });

    // 直近 30 日の資産合計の推移を計算
    const dailyTotals: Record<string, number> = {};
    for (const h of balanceHistories) {
      const dateKey = h.date.toISOString().slice(0, 10);
      dailyTotals[dateKey] = (dailyTotals[dateKey] ?? 0) + h.balance;
    }

    // ── 2. データの集計とフォーマット ──────────────────────

    // 資産合計（負債除外）
    const totalAssets = subAccounts
      .filter(sa => sa.assetType !== "LIABILITY" && sa.balance > 0)
      .reduce((sum, sa) => sum + sa.balance, 0);

    // 資産タイプ別内訳
    const byType: Record<string, number> = {};
    for (const sa of subAccounts) {
      if (sa.assetType !== "LIABILITY") {
        byType[sa.assetType] = (byType[sa.assetType] ?? 0) + sa.balance;
      }
    }

    // 負債合計
    const totalLiabilities = subAccounts
      .filter(sa => sa.assetType === "LIABILITY")
      .reduce((sum, sa) => sum + sa.balance, 0);

    // 純資産
    const netWorth = totalAssets + totalLiabilities;

    // 口座一覧（メインアカウント・サブアカウント単位）
    const accountList = subAccounts
      .map(sa => ({
        mainAccount: sa.mainAccount.label,
        name: sa.currentName,
        type: sa.assetType,
        balance: sa.balance,
      }))
      .sort((a, b) => {
        if (a.type === "LIABILITY" && b.type !== "LIABILITY") return 1;
        if (a.type !== "LIABILITY" && b.type === "LIABILITY") return -1;
        return b.balance - a.balance;
      });

    // 投資銘柄の詳細（平均取得価額含む）
    const holdingsDetail =
      holdings.length > 0
        ? holdings
            .map(
              h =>
                `【${h.name}】（${h.subAccount.mainAccount.label} / ${h.subAccount.currentName}）\n  保有数: ${h.quantity}, 単価: ${formatCurrency(h.unitPrice)}, 評価額: ${formatCurrency(h.valuation)}, 平均取得単価: ${formatCurrency(h.avgCostBasis)}, 利益: ${formatCurrency(h.gainLoss)} (${h.gainLossRate >= 0 ? "+" : ""}${h.gainLossRate}%), 前日比: ${h.dayBeforeRatio >= 0 ? "+" : ""}${h.dayBeforeRatio}%`,
            )
            .join("\n\n")
        : "・未投資";

    // 今月の収支（カテゴリ別内訳付き）
    const totalIncome = currentMonthTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = currentMonthTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const incomeByCategory: Record<string, number> = {};
    for (const t of currentMonthTransactions) {
      if (t.amount > 0) {
        const key = t.subCategory
          ? `${t.subCategory.mainCategory.name}/${t.subCategory.name}`
          : "未分類";
        incomeByCategory[key] = (incomeByCategory[key] ?? 0) + t.amount;
      }
    }

    const expenseByCategory: Record<string, number> = {};
    for (const t of currentMonthTransactions) {
      if (t.amount < 0) {
        const key = t.subCategory
          ? `${t.subCategory.mainCategory.name}/${t.subCategory.name}`
          : "未分類";
        expenseByCategory[key] =
          (expenseByCategory[key] ?? 0) + Math.abs(t.amount);
      }
    }

    // 先月の収支
    const prevMonthIncome = prevMonthTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const prevMonthExpense = prevMonthTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // 過去 30 日間の入出金明細（カテゴリ付き）
    const recentTransactions = past30DaysTransactions
      .slice(0, 30)
      .map(
        t =>
          `・${t.date.toISOString().slice(0, 10)} | ${t.subAccount.mainAccount.label} / ${t.subAccount.currentName} | ${formatCurrency(t.amount)} | ${t.subCategory ? `${t.subCategory.mainCategory.name}/${t.subCategory.name}` : "未分類"} | ${t.desc}`,
      )
      .join("\n");

    // 資産推移
    const sortedDates = Object.keys(dailyTotals).sort();
    const firstTotal = dailyTotals[sortedDates[0] ?? ""] ?? 0;
    const lastTotal = dailyTotals[sortedDates.at(-1) ?? ""] ?? 0;
    const monthChange = lastTotal - firstTotal;

    const recentDates = sortedDates.slice(-7);
    const recentChange =
      recentDates.length >= 2
        ? (dailyTotals[recentDates[recentDates.length - 1]] ?? 0) -
          (dailyTotals[recentDates[0]] ?? 0)
        : 0;

    // 前日比（昨日の資産合計）
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    const yesterdayTotal = dailyTotals[yesterdayKey] ?? 0;
    const dailyChange = lastTotal - yesterdayTotal;

    // ── 3. プロンプトの構築 ──────────────────────────────

    const prompt = `あなたは個人資産管理の専門家です。以下のデータに基づき，正確で実用的な資産状況分析を提供してください。

## 純資産
${formatCurrency(netWorth)}（前日比: ${formatCurrency(dailyChange)}）

## 口座一覧
${accountList
  .map(
    a =>
      `・${a.mainAccount} / ${a.name}（${assetTypeLabel(a.type)}）: ${formatCurrency(a.balance)}`,
  )
  .join("\n")}

## 資産タイプ別内訳（合計: ${formatCurrency(totalAssets)}）
${Object.entries(byType)
  .sort(([, a], [, b]) => b - a)
  .map(
    ([type, amount]) =>
      `${assetTypeLabel(type)}: ${formatCurrency(amount)}（${totalAssets > 0 ? Math.round((amount / totalAssets) * 100) : 0}%）`,
  )
  .join("\n")}

## 負債合計
${assetTypeLabel("LIABILITY")}: ${formatCurrency(totalLiabilities)}

## 投資銘柄（${holdings.length}銘柄）
${holdingsDetail}

## 今月の収支
収入: ${formatCurrency(totalIncome)}（前月: ${formatCurrency(prevMonthIncome)} 前月比 ${prevMonthIncome > 0 ? ((totalIncome / prevMonthIncome) * 100 - 100).toFixed(1) : "—"}%）
支出: ${formatCurrency(totalExpense)}（前月: ${formatCurrency(prevMonthExpense)} 前月比 ${prevMonthExpense > 0 ? ((totalExpense / prevMonthExpense) * 100 - 100).toFixed(1) : "—"}%）
黒字: ${formatCurrency(totalIncome - totalExpense)}

### 今月の収入カテゴリ別内訳
${
  Object.entries(incomeByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amt]) => `・${cat}: ${formatCurrency(amt)}`)
    .join("\n") || "・収入なし"
}

### 今月の支出カテゴリ別内訳
${
  Object.entries(expenseByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amt]) => `・${cat}: ${formatCurrency(amt)}`)
    .join("\n") || "・支出なし"
}

## 過去 30 日間の入出金明細（最新30件）
${recentTransactions || "・なし"}

## 資産推移
### 直近 30 日
総資産: ${formatCurrency(firstTotal)} → ${formatCurrency(lastTotal)}（増減: ${formatCurrency(monthChange)}）

### 直近 7 日
増減: ${formatCurrency(recentChange)}

## 分析の観点
1. 資産構成のバランスと分散度の評価（資産タイプ別，口座別）
2. 貯蓄健全性（黒字額，貯蓄率，純資産の推移）
3. 収支バランスの評価（収入と支出の構造，前月比の変化，カテゴリ別支出の傾向）
4. 支出パターン（過去30日間の入出金から見える消費傾向，季節性，不規則な支出）
5. 投資パフォーマンス（個別銘柄の利益/損失率，ポートフォリオ全体の収益性，資産配分バランス）
6. 前日比・前週比・前月比の増減と，その主な要因
7. 改善すべきポイントや具体的なアクション
8. 全体的なコメントと今後の展望

出力はマークダウン形式で，読みやすく実用的な分析にしてください。
出力の句読点には全角の「，．」を用い，全角文字と半角文字の間には半角スペースを入れてください。
各項目について具体的な数値を踏まえた分析を行ってください。
長さは 1000-2000 文字程度まで可です。簡略化せず，詳細に分析してください。`;

    // ── 4. LLM へのリクエスト ────────────────────────────

    const llamaUrl = process.env.LLAMA_SERVER_URL;
    if (!llamaUrl) {
      const error = "LLAMA_SERVER_URL が設定されていません。";
      logger.error(`[Analysis] ${error}`);
      await prisma.assetAnalysis.create({
        data: {
          content: "",
          prompt,
          status: "FAILED",
          error,
          providers: null,
          analysisDate: getAnalysisDate(),
        },
      });
      return { success: false, error };
    }

    logger.info(
      { model: process.env.LLAMA_MODEL_NAME },
      "[Analysis] Sending request to llama-server.",
    );

    const response = await fetch(llamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.LLAMA_MODEL_NAME ?? "llama",
        messages: [
          {
            role: "system",
            content:
              "あなたは個人資産管理の専門家です。日本語で回答してください。詳細で実用的な分析を提供してください。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 16384,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = `llama-server エラー (HTTP ${response.status}): ${errorText.slice(0, 200)}`;
      logger.error(
        { status: response.status, body: errorText },
        "[Analysis] llama-server returned error.",
      );
      await prisma.assetAnalysis.create({
        data: {
          content: "",
          prompt,
          status: "FAILED",
          error,
          providers: null,
          analysisDate: getAnalysisDate(),
        },
      });
      return { success: false, error };
    }

    const rawText = await response.text();
    logger.info(
      { rawTextLength: rawText.length },
      "[Analysis] Received response from llama-server.",
    );

    let responseBody: Record<string, unknown>;
    try {
      responseBody = JSON.parse(rawText);
    } catch {
      const error = `llama-server から無効な JSON が返されました: ${rawText.slice(0, 200)}`;
      logger.error(
        { rawText: rawText.slice(0, 500) },
        "[Analysis] Invalid JSON response from llama-server.",
      );
      await prisma.assetAnalysis.create({
        data: {
          content: "",
          prompt,
          status: "FAILED",
          error,
          providers: null,
          analysisDate: getAnalysisDate(),
        },
      });
      return { success: false, error };
    }

    // llama.cpp のレスポンスフォーマットは複数種類あるため、全て試す
    const choices = (responseBody as Record<string, unknown>).choices as
      | Array<Record<string, unknown>>
      | undefined;

    let analysisContent = "";
    if (choices?.[0]) {
      const msg = choices[0].message as Record<string, unknown> | undefined;
      // OpenAI 互換: message.content
      analysisContent = (msg?.content as string) ?? "";
      // reasoning_content フィールドにコンテンツがある場合（一部モデル）
      if (!analysisContent) {
        analysisContent = (msg?.reasoning_content as string) ?? "";
      }
      // デルタ形式: delta.content (streaming レスポンスの場合)
      if (!analysisContent) {
        analysisContent =
          ((choices[0].delta as Record<string, unknown>)?.content as string) ??
          "";
      }
      // completion 形式: text フィールド
      if (!analysisContent) {
        analysisContent = (choices[0].text as string) ?? "";
      }
    }

    if (!analysisContent) {
      logger.warn(
        { responseBody: JSON.stringify(responseBody).slice(0, 500) },
        "[Analysis] Empty content in response.",
      );
      const error = `llama-server から空のコンテンツが返されました。レスポンス: ${JSON.stringify(responseBody).slice(0, 300)}`;
      await prisma.assetAnalysis.create({
        data: {
          content: "",
          prompt,
          status: "FAILED",
          error,
          providers: null,
          analysisDate: getAnalysisDate(),
        },
      });
      return { success: false, error };
    }

    // ── 5. 結果の保存 ────────────────────────────────────

    await prisma.assetAnalysis.create({
      data: {
        content: analysisContent,
        prompt,
        status: "COMPLETED",
        providers: null,
        analysisDate: getAnalysisDate(),
      },
    });

    logger.info("[Analysis] Analysis completed and saved.");
    return { success: true, content: analysisContent };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: error },
      "[Analysis] Unexpected error during analysis.",
    );

    await prisma.assetAnalysis.create({
      data: {
        content: "",
        prompt: null,
        status: "FAILED",
        error: `分析中にエラーが発生しました: ${errorMessage}`,
        providers: null,
        analysisDate: getAnalysisDate(),
      },
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * 分析結果の一覧を取得するサーバーアクションである．
 * 最新順にソートされて返される．
 */
export async function getAnalysisResults(limit?: number) {
  const where = {
    status: { not: "PENDING" } as const,
  };

  return prisma.assetAnalysis.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...(limit ? { take: limit } : {}),
  });
}

/**
 * 分析結果を削除するサーバーアクションである．
 * 指定された ID の分析記録を永久的に削除する．
 */
export async function deleteAnalysisResult(id: string) {
  try {
    await prisma.assetAnalysis.delete({
      where: { id },
    });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: error, id },
      "[Analysis] Failed to delete analysis result.",
    );
    return { success: false, error: errorMessage };
  }
}
