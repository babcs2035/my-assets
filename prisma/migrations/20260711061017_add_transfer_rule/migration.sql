-- CreateTable
CREATE TABLE "TransferRule" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "targetSubAccountId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransferRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferRule_targetSubAccountId_idx" ON "TransferRule"("targetSubAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferRule_keyword_targetSubAccountId_key" ON "TransferRule"("keyword", "targetSubAccountId");

-- AddForeignKey
ALTER TABLE "TransferRule" ADD CONSTRAINT "TransferRule_targetSubAccountId_fkey" FOREIGN KEY ("targetSubAccountId") REFERENCES "SubAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
