-- AlterTable
ALTER TABLE "PricePolicy" ADD COLUMN     "isPercentage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'GUEST';
