import { createHash } from "node:crypto";
import logger from "./logger";

/**
 * 取引 (Transaction) の決定論的な ID を生成する関数である．
 * サブ口座 ID，日付，金額，摘要を組み合わせて SHA-256 ハッシュを生成することで，
 * 重複登録を防ぎつつ一意な ID を特定できる．
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
