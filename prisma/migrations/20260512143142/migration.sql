/*
  Warnings:

  - You are about to drop the column `roomTypeId` on the `PriceRule` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PriceRule" DROP CONSTRAINT "PriceRule_roomTypeId_fkey";

-- AlterTable
ALTER TABLE "PriceRule" DROP COLUMN "roomTypeId";
