-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "AssetAnalysis" (
    "id" TEXT NOT NULL,
    "analysisDate" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "providers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetAnalysis_analysisDate_idx" ON "AssetAnalysis"("analysisDate");

-- CreateIndex
CREATE INDEX "AssetAnalysis_status_idx" ON "AssetAnalysis"("status");

-- CreateIndex
CREATE INDEX "AssetAnalysis_createdAt_idx" ON "AssetAnalysis"("createdAt");
