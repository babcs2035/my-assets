-- CreateTable
CREATE TABLE "CreditCardBilling" (
    "id" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "billingDate" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "content" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardBilling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCardBilling_subAccountId_billingDate_idx" ON "CreditCardBilling"("subAccountId", "billingDate");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardBilling_subAccountId_billingDate_key" ON "CreditCardBilling"("subAccountId", "billingDate");

-- AddForeignKey
ALTER TABLE "CreditCardBilling" ADD CONSTRAINT "CreditCardBilling_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
