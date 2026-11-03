-- CreateEnum
CREATE TYPE "WrapStatus" AS ENUM ('published', 'deleted');

-- CreateEnum
CREATE TYPE "CardStyle" AS ENUM ('huella', 'cordillera', 'constelacion');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('es', 'en');

-- CreateEnum
CREATE TYPE "ImagesStatus" AS ENUM ('queued', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('none', 'queued', 'rendering', 'ready', 'failed');

-- CreateTable
CREATE TABLE "wraps" (
    "id" UUID NOT NULL,
    "github_user_id" INTEGER NOT NULL,
    "login" TEXT NOT NULL,
    "login_key" TEXT NOT NULL,
    "previous_login_key" TEXT,
    "year" INTEGER NOT NULL,
    "locale" "Locale" NOT NULL,
    "card_style" "CardStyle" NOT NULL,
    "snapshot" JSONB,
    "status" "WrapStatus" NOT NULL,
    "data_version" INTEGER NOT NULL,
    "images_version" INTEGER NOT NULL,
    "images_ready_version" INTEGER,
    "images_status" "ImagesStatus" NOT NULL,
    "video_ready_version" INTEGER,
    "video_status" "VideoStatus" NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "regenerated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wraps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wraps_login_key_year_idx" ON "wraps"("login_key", "year");

-- CreateIndex
CREATE INDEX "wraps_previous_login_key_year_idx" ON "wraps"("previous_login_key", "year");

-- CreateIndex
CREATE UNIQUE INDEX "wraps_github_user_id_year_key" ON "wraps"("github_user_id", "year");

