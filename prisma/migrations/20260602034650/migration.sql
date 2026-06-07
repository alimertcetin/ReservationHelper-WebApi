/*
  Warnings:

  - Added the required column `paymentMethods` to the `Account` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "paymentMethods" JSONB NOT NULL;
