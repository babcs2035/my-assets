/*
  Warnings:

  - A unique constraint covering the columns `[subAccountId,name]` on the table `Holding` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "HoldingHistory" DROP CONSTRAINT "HoldingHistory_subAccountId_fkey";

-- AlterTable
ALTER TABLE "HoldingHistory" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Holding_subAccountId_name_key" ON "Holding"("subAccountId", "name");

-- AddForeignKey
ALTER TABLE "HoldingHistory" ADD CONSTRAINT "HoldingHistory_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
