/*
  Warnings:

  - A unique constraint covering the columns `[name,type]` on the table `MainCategory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- DropIndex
DROP INDEX "MainCategory_name_key";

-- AlterTable
ALTER TABLE "MainCategory" ADD COLUMN     "type" "CategoryType" NOT NULL DEFAULT 'EXPENSE';

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncSuccess" BOOLEAN;

-- CreateIndex
CREATE UNIQUE INDEX "MainCategory_name_type_key" ON "MainCategory"("name", "type");
