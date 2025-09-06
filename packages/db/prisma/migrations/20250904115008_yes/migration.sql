/*
  Warnings:

  - A unique constraint covering the columns `[zikrId,script,textNorm]` on the table `ZikrVariant` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ZikrVariant_zikrId_script_textNorm_key" ON "ZikrVariant"("zikrId", "script", "textNorm");
