import { Controller, Get, Header, Inject, Logger, Res } from '@nestjs/common';
import { checkHealth, type HealthProbe, type HealthReport } from '@wrapped/shared';
import type { Response } from 'express';

/** What the worker cannot render without, as wired by the module. */
export const HEALTH_PROBES = Symbol('HEALTH_PROBES');

const logger = new Logger('Health');

/**
 * `GET /health` for the container health check (the worker runs inside this process): 200 when
 * the queue's Redis answers and the shared volume takes writes, 503 naming the one that doesn't.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(HEALTH_PROBES) private readonly probes: HealthProbe[]) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async health(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await checkHealth(this.probes, {
      onFailure: (name, reason) => logger.warn(`${name} is down: ${String(reason)}`),
    });
    response.status(report.status === 'ok' ? 200 : 503);
    return report;
  }
}
