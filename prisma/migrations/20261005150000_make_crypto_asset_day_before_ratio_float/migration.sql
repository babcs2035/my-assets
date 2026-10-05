-- AlterTable
-- 前日比は小数のパーセントなので，Holding と同じく DOUBLE PRECISION にする．
-- 同期はこの列を書き込んでいないため既存の値は NULL で，型の変更だけでよい
ALTER TABLE "CryptoAsset" ALTER COLUMN "dayBeforeRatio" SET DATA TYPE DOUBLE PRECISION;
