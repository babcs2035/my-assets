-- AlterTable
ALTER TABLE "Holding" ALTER COLUMN "dayBeforeRatio" DROP NOT NULL,
ALTER COLUMN "dayBeforeRatio" SET DATA TYPE DOUBLE PRECISION;

-- 同期は作成時に 0 を入れたきり前日比を更新していなかった (ACC-1)．
-- 既存の値はすべて意味のない 0 なので，次の同期で計算されるまで「不明」にする
UPDATE "Holding" SET "dayBeforeRatio" = NULL;
