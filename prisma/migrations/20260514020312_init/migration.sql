-- CreateIndex
CREATE INDEX "BalanceHistory_subAccountId_idx" ON "BalanceHistory"("subAccountId");

-- CreateIndex
CREATE INDEX "BalanceHistory_date_idx" ON "BalanceHistory"("date");

-- CreateIndex
CREATE INDEX "CategoryRule_subCategoryId_idx" ON "CategoryRule"("subCategoryId");

-- CreateIndex
CREATE INDEX "CryptoAsset_subAccountId_idx" ON "CryptoAsset"("subAccountId");

-- CreateIndex
CREATE INDEX "Holding_subAccountId_idx" ON "Holding"("subAccountId");

-- CreateIndex
CREATE INDEX "MainAccount_providerId_idx" ON "MainAccount"("providerId");

-- CreateIndex
CREATE INDEX "SubAccount_mainAccountId_idx" ON "SubAccount"("mainAccountId");

-- CreateIndex
CREATE INDEX "SubAccount_assetType_idx" ON "SubAccount"("assetType");

-- CreateIndex
CREATE INDEX "SubAccount_isHidden_idx" ON "SubAccount"("isHidden");

-- CreateIndex
CREATE INDEX "SubCategoryItem_mainCategoryId_idx" ON "SubCategoryItem"("mainCategoryId");

-- CreateIndex
CREATE INDEX "Transaction_subAccountId_idx" ON "Transaction"("subAccountId");

-- CreateIndex
CREATE INDEX "Transaction_subAccountId_date_idx" ON "Transaction"("subAccountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_isTransfer_idx" ON "Transaction"("isTransfer");

-- CreateIndex
CREATE INDEX "Transaction_transferId_idx" ON "Transaction"("transferId");

-- CreateIndex
CREATE INDEX "Transaction_linkedTransId_idx" ON "Transaction"("linkedTransId");

-- CreateIndex
CREATE INDEX "Transaction_amount_idx" ON "Transaction"("amount");
