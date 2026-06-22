"use client";

import {
  Brain,
  Calendar,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import type { NextPage } from "next";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { type AnalysisResult, runAssetAnalysis } from "@/actions/analysis";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJSTDateTime } from "@/lib/utils";

/**
 * 分析ページ（クライアントコンポーネント）である．
 * 分析結果の表示，履歴一覧，手動分析実行機能，削除機能を提供する．
 */
const AnalysisPage: NextPage = () => {
  const [latestResult, setLatestResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPromptId, setShowPromptId] = useState<string | null>(null);

  /**
   * 分析結果をフェッチし，状態を更新する関数である．
   */
  const fetchAnalysisData = useCallback(async () => {
    try {
      const { getAnalysisResults } = await import("@/actions/analysis");
      const results = await getAnalysisResults(20);

      if (results.length > 0) {
        setLatestResult(results[0] as AnalysisResult);
        setHistory(results as AnalysisResult[]);
        setExpandedId((results[0] as AnalysisResult).id);
      } else {
        setLatestResult(null);
        setHistory([]);
        setExpandedId(null);
      }
    } catch {
      toast.error("分析結果の読み込みに失敗しました。");
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    void fetchAnalysisData();
  }, [fetchAnalysisData]);

  /**
   * 手動で分析を実行する関数である．
   */
  const handleRunAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runAssetAnalysis();

      if (result.success) {
        toast.success("分析が完了しました。");
        await fetchAnalysisData();
      } else {
        toast.error(`分析に失敗しました: ${result.error}`);
      }
    } catch {
      toast.error("分析の実行中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [fetchAnalysisData]);

  /**
   * 分析結果を削除する関数である．
   */
  const handleDeleteAnalysis = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const { deleteAnalysisResult } = await import("@/actions/analysis");
        const result = await deleteAnalysisResult(id);

        if (result.success) {
          toast.success("分析結果を削除しました。");
          await fetchAnalysisData();
        } else {
          toast.error(`削除に失敗しました: ${result.error}`);
        }
      } catch {
        toast.error("削除中にエラーが発生しました。");
      } finally {
        setDeletingId(null);
      }
    },
    [fetchAnalysisData],
  );

  /**
   * 分析履歴の開閉を切り替える関数である．
   */
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  /**
   * プロンプト表示の切り替えを行う関数である．
   */
  const handleTogglePrompt = useCallback((id: string) => {
    setShowPromptId(prev => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="分析" icon={Brain} />

      {/* ── 分析実行ボタン ──────────────────────────── */}
      <div className="flex justify-end">
        <Button onClick={handleRunAnalysis} loading={loading} variant="default">
          <Sparkles className="h-4 w-4" />
          分析を実行
        </Button>
      </div>

      {/* ── 最新分析結果 ───────────────────────────── */}
      {latestResult && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium text-zinc-200">
                最新の分析結果
              </CardTitle>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                {latestResult.status === "COMPLETED" ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-500">完了</span>
                  </>
                ) : latestResult.status === "FAILED" ? (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-red-500">失敗</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    <span className="text-blue-500">実行中</span>
                  </>
                )}
                <span>{formatJSTDateTime(latestResult.createdAt as Date)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {latestResult.status === "COMPLETED" && latestResult.content ? (
              <div className="prose prose-sm prose-invert max-w-none prose-headings:text-zinc-200 prose-h2:text-base prose-h3:text-sm prose-strong:text-zinc-100 prose-code:text-zinc-300 prose-code:bg-zinc-800 prose-code:rounded prose-code:px-1 prose-pre:bg-zinc-900 prose-a:text-blue-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {latestResult.content}
                </ReactMarkdown>
              </div>
            ) : latestResult.status === "FAILED" && latestResult.error ? (
              <div className="text-sm text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                {latestResult.error}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                分析を実行してください...
              </div>
            )}
            {latestResult.prompt && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                  onPointerDown={() =>
                    setShowPromptId(prev =>
                      prev === "latest" ? null : "latest",
                    )
                  }
                >
                  {showPromptId === "latest" ? "▼" : "▶"}
                  プロンプトを表示
                </button>
                {showPromptId === "latest" && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 mt-2 max-h-96 overflow-y-auto">
                    <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
                      {latestResult.prompt}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 分析履歴 ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-zinc-200">
            分析履歴
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-zinc-500 text-center py-8">
              分析履歴はありません．「分析を実行」から初めてください。
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(result => {
                const isOpen = expandedId === result.id;

                return (
                  <div
                    key={result.id}
                    className={`border rounded-lg overflow-hidden transition-colors ${
                      isOpen
                        ? "border-zinc-700 bg-zinc-800/50"
                        : "border-zinc-800 hover:bg-zinc-900/50"
                    }`}
                  >
                    <div
                      className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
                      onPointerDown={() => handleToggleExpand(result.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Calendar className="h-4 w-4 text-zinc-500 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-zinc-200">
                            {formatJSTDateTime(result.createdAt as Date)}
                          </span>
                          <span className="block text-xs text-zinc-500 truncate">
                            {(result.content as string).length}文字
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {result.status === "COMPLETED" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : result.status === "FAILED" ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                        <button
                          type="button"
                          className="p-1 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
                          onPointerDown={e => {
                            e.stopPropagation();
                            void handleDeleteAnalysis(result.id);
                          }}
                        >
                          {deletingId === result.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isOpen && result.status === "COMPLETED" && (
                      <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
                        <div className="prose prose-sm prose-invert max-w-none prose-headings:text-zinc-200 prose-h2:text-base prose-h3:text-sm prose-strong:text-zinc-100 prose-code:text-zinc-300 prose-code:bg-zinc-800 prose-code:rounded prose-code:px-1 prose-pre:bg-zinc-900 prose-a:text-blue-400">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {result.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {isOpen && result.status === "FAILED" && (
                      <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
                        <div className="text-sm text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                          {result.error}
                        </div>
                      </div>
                    )}

                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
                        <button
                          type="button"
                          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2 flex items-center gap-1"
                          onPointerDown={() => handleTogglePrompt(result.id)}
                        >
                          {showPromptId === result.id ? "▼" : "▶"}
                          プロンプトを表示
                        </button>
                        {showPromptId === result.id && (
                          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 max-h-96 overflow-y-auto">
                            <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
                              {result.prompt || "(プロンプトなし)"}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalysisPage;
