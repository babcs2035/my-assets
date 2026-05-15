import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import logger from "./logger";

/**
 * データベース接続文字列を環境変数から取得する．
 */
const connectionString = `${process.env.DATABASE_URL}`;

/**
 * PrismaClient のインスタンスを保持するためのグローバルオブジェクトを定義する．
 * これにより，開発環境でのホットリロード時に複数の接続インスタンスが生成されるのを防ぐ．
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * PostgreSQL の接続プールを初期化する．
 */
const pool = new Pool({ connectionString });

/**
 * Prisma の PostgreSQL アダプターを作成する．
 */
const adapter = new PrismaPg(pool);

/**
 * PrismaClient のインスタンスをエクスポートする．
 * 既存のインスタンスがある場合はそれを再利用し，ない場合は新規作成する．
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
export { pool };

logger.info("🐘 Prisma client initialized with PostgreSQL adapter.");

/**
 * 開発環境の場合，グローバルオブジェクトにインスタンスを保存して再利用可能にする．
 */
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
