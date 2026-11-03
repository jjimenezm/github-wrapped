import { Controller, Get } from '@nestjs/common';

/** For the container health check: the worker runs inside this process. */
@Controller('health')
export class HealthController {
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
