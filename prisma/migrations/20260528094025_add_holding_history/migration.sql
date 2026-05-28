-- CreateTable
CREATE TABLE "HoldingHistory" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "subAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "avgCostBasis" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "valuation" INTEGER NOT NULL,
    "gainLoss" INTEGER NOT NULL,
    "gainLossRate" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HoldingHistory_subAccountId_name_date_key" ON "HoldingHistory"("subAccountId", "name", "date");

-- CreateIndex
CREATE INDEX "HoldingHistory_subAccountId_name_idx" ON "HoldingHistory"("subAccountId", "name");

-- CreateIndex
CREATE INDEX "HoldingHistory_date_idx" ON "HoldingHistory"("date");

-- AddForeignKey
ALTER TABLE "HoldingHistory" ADD CONSTRAINT "HoldingHistory_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
