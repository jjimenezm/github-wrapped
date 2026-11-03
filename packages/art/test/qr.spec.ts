import { qrMatrix } from '../src';
import { decodeMatrix } from './helpers';

describe('qrMatrix', () => {
  const url = 'https://wrapped.jjimenezm.dev/@jpjimenez/2026';

  it('encodes exactly the text it was given', () => {
    expect(decodeMatrix(qrMatrix(url))).toBe(url);
  });

  it('is a square module matrix', () => {
    const matrix = qrMatrix(url);
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    for (const row of matrix) expect(row).toHaveLength(matrix.length);
  });

  it('fits the longest GitHub login (39 characters)', () => {
    const longest = `https://wrapped.jjimenezm.dev/@${'a'.repeat(39)}/2026`;
    expect(decodeMatrix(qrMatrix(longest))).toBe(longest);
  });
});
