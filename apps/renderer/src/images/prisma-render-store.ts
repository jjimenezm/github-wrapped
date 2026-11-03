import type { OnModuleDestroy } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { WrapSnapshot } from '@wrapped/shared';
import type { RenderableWrap, RenderStore } from './render-store';

const WRAP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The api's `wraps` table (same Prisma schema): the worker reads a wrap and reports its images. */
export class PrismaRenderStore implements RenderStore, OnModuleDestroy {
  constructor(readonly prisma: PrismaClient) {}

  async findForRender(wrapId: string): Promise<RenderableWrap | null> {
    if (!WRAP_ID.test(wrapId)) return null;
    const row = await this.prisma.wrap.findUnique({
      where: { id: wrapId },
      select: {
        id: true,
        login: true,
        year: true,
        locale: true,
        cardStyle: true,
        snapshot: true,
        status: true,
        imagesVersion: true,
        imagesReadyVersion: true,
        imagesStatus: true,
      },
    });
    return row ? { ...row, snapshot: row.snapshot as unknown as WrapSnapshot | null } : null;
  }

  async markImagesReady(wrapId: string, imagesVersion: number): Promise<void> {
    // The ready version only moves forward; the status turns ready only for the current version.
    await this.prisma.$executeRaw`
      UPDATE wraps
      SET images_ready_version = GREATEST(COALESCE(images_ready_version, 0), ${imagesVersion}),
          images_status = CASE WHEN images_version = ${imagesVersion}
                               THEN 'ready'::"ImagesStatus" ELSE images_status END,
          updated_at = now()
      WHERE id = ${wrapId}::uuid AND status = 'published'`;
  }

  async markImagesFailed(wrapId: string, imagesVersion: number): Promise<void> {
    await this.prisma.wrap.updateMany({
      where: { id: wrapId, imagesVersion, status: 'published' },
      data: { imagesStatus: 'failed' },
    });
  }

  listPublished() {
    return this.prisma.wrap.findMany({
      where: { status: 'published' },
      select: { id: true, imagesVersion: true, imagesReadyVersion: true },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
