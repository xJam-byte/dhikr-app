-- CreateEnum
CREATE TYPE "public"."UserLevel" AS ENUM ('BEGINNER', 'ADVANCED');

-- CreateEnum
CREATE TYPE "public"."RecordingStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "level" "public"."UserLevel" NOT NULL DEFAULT 'BEGINNER',
    "language" TEXT NOT NULL DEFAULT 'ru',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Zikr" (
    "id" TEXT NOT NULL,
    "arabicText" TEXT NOT NULL,
    "translit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Zikr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Translation" (
    "id" TEXT NOT NULL,
    "zikrId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Recording" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zikrId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "durationMs" INTEGER,
    "sizeBytes" INTEGER,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."RecordingStatus" NOT NULL DEFAULT 'QUEUED',
    "text" TEXT,
    "score" DOUBLE PRECISION,
    "processedAt" TIMESTAMP(3),
    "dailyCounterId" TEXT,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TotalCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TotalCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_zikrId_lang_key" ON "public"."Translation"("zikrId", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_checksum_key" ON "public"."Recording"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCounter_userId_date_key" ON "public"."DailyCounter"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TotalCounter_userId_key" ON "public"."TotalCounter"("userId");

-- AddForeignKey
ALTER TABLE "public"."Translation" ADD CONSTRAINT "Translation_zikrId_fkey" FOREIGN KEY ("zikrId") REFERENCES "public"."Zikr"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recording" ADD CONSTRAINT "Recording_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recording" ADD CONSTRAINT "Recording_zikrId_fkey" FOREIGN KEY ("zikrId") REFERENCES "public"."Zikr"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recording" ADD CONSTRAINT "Recording_dailyCounterId_fkey" FOREIGN KEY ("dailyCounterId") REFERENCES "public"."DailyCounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyCounter" ADD CONSTRAINT "DailyCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TotalCounter" ADD CONSTRAINT "TotalCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
