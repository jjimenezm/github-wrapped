import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** The image (and later video) worker, plus a small HTTP server for the health check. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
