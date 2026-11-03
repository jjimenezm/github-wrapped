import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('answers ok while the process is up', () => {
    expect(new HealthController().health()).toEqual({ status: 'ok' });
  });
});
