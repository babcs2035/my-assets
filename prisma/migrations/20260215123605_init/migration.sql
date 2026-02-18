-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CASH', 'INVESTMENT', 'CRYPTO', 'POINT');

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MainAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "mfUrlId" TEXT,

    CONSTRAINT "MainAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubAccount" (
    "id" TEXT NOT NULL,
    "mainAccountId" TEXT NOT NULL,
    "currentName" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL DEFAULT 'CASH',
    "balance" INTEGER NOT NULL,

    CONSTRAINT "SubAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceHistory" (
    "id" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "balance" INTEGER NOT NULL,

    CONSTRAINT "BalanceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "avgCostBasis" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "valuation" INTEGER NOT NULL,
    "dayBeforeRatio" INTEGER NOT NULL,
    "gainLoss" INTEGER NOT NULL,
    "gainLossRate" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoAsset" (
    "id" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "valuation" INTEGER NOT NULL,
    "dayBeforeRatio" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointDetail" (
    "id" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "expirationDate" TIMESTAMP(3),

    CONSTRAINT "PointDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MainCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MainCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubCategoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mainCategoryId" TEXT NOT NULL,

    CONSTRAINT "SubCategoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "desc" TEXT NOT NULL,
    "subCategoryId" TEXT,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "transferId" TEXT,
    "linkedTransId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "subCategoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_name_key" ON "Provider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MainAccount_mfUrlId_key" ON "MainAccount"("mfUrlId");

-- CreateIndex
CREATE UNIQUE INDEX "SubAccount_mainAccountId_currentName_key" ON "SubAccount"("mainAccountId", "currentName");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceHistory_subAccountId_date_key" ON "BalanceHistory"("subAccountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PointDetail_subAccountId_key" ON "PointDetail"("subAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MainCategory_name_key" ON "MainCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubCategoryItem_mainCategoryId_name_key" ON "SubCategoryItem"("mainCategoryId", "name");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_subCategoryId_idx" ON "Transaction"("subCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_keyword_subCategoryId_key" ON "CategoryRule"("keyword", "subCategoryId");

-- AddForeignKey
ALTER TABLE "MainAccount" ADD CONSTRAINT "MainAccount_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubAccount" ADD CONSTRAINT "SubAccount_mainAccountId_fkey" FOREIGN KEY ("mainAccountId") REFERENCES "MainAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceHistory" ADD CONSTRAINT "BalanceHistory_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoAsset" ADD CONSTRAINT "CryptoAsset_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointDetail" ADD CONSTRAINT "PointDetail_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCategoryItem" ADD CONSTRAINT "SubCategoryItem_mainCategoryId_fkey" FOREIGN KEY ("mainCategoryId") REFERENCES "MainCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
