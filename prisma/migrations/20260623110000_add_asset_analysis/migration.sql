-- Create AnalysisStatus enum before creating the AssetAnalysis table
DO $$ BEGIN
 CREATE TYPE "AnalysisStatus" AS ENUM('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create the AssetAnalysis table with analysisDate for tracking analysis timestamps
CREATE TABLE "AssetAnalysis" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "providers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prompt" TEXT,
    "analysisDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAnalysis_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "AssetAnalysis_status_idx" ON "AssetAnalysis"("status");
CREATE INDEX "AssetAnalysis_createdAt_idx" ON "AssetAnalysis"("createdAt");
CREATE INDEX "AssetAnalysis_analysisDate_idx" ON "AssetAnalysis"("analysisDate");
