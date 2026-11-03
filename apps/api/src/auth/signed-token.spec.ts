import { signToken, verifyToken } from './signed-token';

const SECRET = 'k'.repeat(32);
const NOW = Date.UTC(2026, 2, 1, 12);
const inOneHour = NOW / 1000 + 3600;

describe('signed tokens', () => {
  it('round-trips a payload that has not expired', () => {
    const token = signToken({ sub: 4242, exp: inOneHour }, SECRET);
    expect(verifyToken(token, SECRET, NOW)).toEqual({ sub: 4242, exp: inOneHour });
  });

  it('rejects a token signed with another secret', () => {
    const token = signToken({ sub: 4242, exp: inOneHour }, 'x'.repeat(32));
    expect(verifyToken(token, SECRET, NOW)).toBeNull();
  });

  it('rejects a payload changed after signing', () => {
    const [, signature] = signToken({ sub: 4242, exp: inOneHour }, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 1, exp: inOneHour })).toString('base64url');
    expect(verifyToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signToken({ sub: 4242, exp: NOW / 1000 - 1 }, SECRET);
    expect(verifyToken(token, SECRET, NOW)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c', '.', 'bm90IGpzb24.c2ln'])('rejects garbage %p', (token) => {
    expect(verifyToken(token, SECRET, NOW)).toBeNull();
  });
});
