-- DropForeignKey
ALTER TABLE "BalanceHistory" DROP CONSTRAINT "BalanceHistory_subAccountId_fkey";

-- DropForeignKey
ALTER TABLE "CryptoAsset" DROP CONSTRAINT "CryptoAsset_subAccountId_fkey";

-- DropForeignKey
ALTER TABLE "Holding" DROP CONSTRAINT "Holding_subAccountId_fkey";

-- DropForeignKey
ALTER TABLE "PointDetail" DROP CONSTRAINT "PointDetail_subAccountId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_subAccountId_fkey";

-- AddForeignKey
ALTER TABLE "BalanceHistory" ADD CONSTRAINT "BalanceHistory_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoAsset" ADD CONSTRAINT "CryptoAsset_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointDetail" ADD CONSTRAINT "PointDetail_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
