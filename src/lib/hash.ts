import { createHash } from "node:crypto";
import logger from "./logger";

/**
 * 取引 (Transaction) の決定論的な ID を生成する関数である．
 * サブ口座 ID，日付，金額，摘要を組み合わせて SHA-256 ハッシュを生成し，再同期での重複登録を防ぐ．
 * 同じ日に同じ金額・摘要の取引が複数あると同じ ID になり 1 行にまとまる（既知の問題 DATA-1，
 * docs/d0001_2026-10-02_repository_review.md）．解消には MF の act id を保存するスキーマ変更が要る．
 */
export async function generateTransactionId(
  subAccountId: string,
  date: string,
  amount: number,
  desc: string,
): Promise<string> {
  const input = `${subAccountId}|${date}|${amount}|${desc}`;
  const id = createHash("sha256").update(input).digest("hex");

  logger.debug(`🔑 Generated transaction ID: ${id.substring(0, 8)}...`);

  return id;
}
