/*
  Warnings:

  - You are about to drop the column `balance` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `bankName` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `iban` on the `Account` table. All the data in the column will be lost.
  - The `type` column on the `Account` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `price` on the `PriceRule` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `received` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `overrides` on the `RoomStay` table. All the data in the column will be lost.
  - Made the column `roomTypeId` on table `RoomStay` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `method` on the `Transaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "RoomStay" DROP CONSTRAINT "RoomStay_roomTypeId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_reservationId_fkey";

-- DropIndex
DROP INDEX "Account_iban_key";

-- DropIndex
DROP INDEX "Guest_phone_key";

-- AlterTable
ALTER TABLE "Account" DROP COLUMN "balance",
DROP COLUMN "bankName",
DROP COLUMN "iban",
ADD COLUMN     "details" JSONB,
DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'BANK';

-- AlterTable
ALTER TABLE "PriceRule" DROP COLUMN "price";

-- AlterTable
ALTER TABLE "Reservation" DROP COLUMN "isActive",
DROP COLUMN "received";

-- AlterTable
ALTER TABLE "RoomStay" DROP COLUMN "overrides",
ADD COLUMN     "policies" JSONB,
ALTER COLUMN "roomTypeId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "method",
ADD COLUMN     "method" TEXT NOT NULL;

-- DropEnum
DROP TYPE "AccountType";

-- DropEnum
DROP TYPE "PaymentMethod";

-- CreateTable
CREATE TABLE "RoomTypePrice" (
    "id" SERIAL NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "overrides" JSONB,
    "roomTypeId" INTEGER NOT NULL,
    "priceRuleId" INTEGER NOT NULL,

    CONSTRAINT "RoomTypePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomTypePrice_roomTypeId_priceRuleId_key" ON "RoomTypePrice"("roomTypeId", "priceRuleId");

-- AddForeignKey
ALTER TABLE "RoomStay" ADD CONSTRAINT "RoomStay_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTypePrice" ADD CONSTRAINT "RoomTypePrice_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTypePrice" ADD CONSTRAINT "RoomTypePrice_priceRuleId_fkey" FOREIGN KEY ("priceRuleId") REFERENCES "PriceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
