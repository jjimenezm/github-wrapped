import { PrismaClient } from '@prisma/client';
import { PrismaWrapsRepository } from '../../src/wraps/prisma-wraps.repository';
import { describeWrapsRepository } from '../../src/wraps/wraps.repository.contract';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('Integration tests need DATABASE_URL (a migrated, disposable Postgres)');
}

const prisma = new PrismaClient({ datasourceUrl: url });

describeWrapsRepository(
  'PrismaWrapsRepository',
  async () => {
    await prisma.$executeRaw`TRUNCATE TABLE wraps`;
    return new PrismaWrapsRepository(prisma);
  },
  () => prisma.$disconnect(),
);
