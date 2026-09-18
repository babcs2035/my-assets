import type { Metadata } from "next";
import { AnalysisContent } from "@/components/analysis/analysis-content";

/**
 * 分析ページメタデータである．
 * クライアントページのままでは metadata をエクスポートできないため，
 * サーバーコンポーネントとクライアントコンポーネントを分離している．
 */
export const metadata: Metadata = {
  title: "分析 | My Assets",
  description: "AI による資産分析結果の表示と履歴管理",
};

/**
 * 分析ページコンポーネントである．
 * メタデータを提供するサーバーコンポーネントで，実体は AnalysisContent が担う．
 */
export default function AnalysisPage() {
  return <AnalysisContent />;
}
