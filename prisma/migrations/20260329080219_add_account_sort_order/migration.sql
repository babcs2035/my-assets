-- DropForeignKey
ALTER TABLE "SubAccount" DROP CONSTRAINT "SubAccount_mainAccountId_fkey";

-- AlterTable
ALTER TABLE "MainAccount" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubAccount" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "SubAccount" ADD CONSTRAINT "SubAccount_mainAccountId_fkey" FOREIGN KEY ("mainAccountId") REFERENCES "MainAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
