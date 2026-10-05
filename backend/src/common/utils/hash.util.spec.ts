import { hmacHash, constantTimeEquals } from './hash.util';

describe('hash.util', () => {
  it('produces a deterministic hash for the same input and secret', () => {
    const a = hmacHash('123456', 'secret');
    const b = hmacHash('123456', 'secret');
    expect(a).toBe(b);
  });

  it('produces different hashes for different secrets', () => {
    const a = hmacHash('123456', 'secret-a');
    const b = hmacHash('123456', 'secret-b');
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = hmacHash('123456', 'secret');
    const b = hmacHash('654321', 'secret');
    expect(a).not.toBe(b);
  });

  it('never returns the plaintext value', () => {
    const hash = hmacHash('123456', 'secret');
    expect(hash).not.toContain('123456');
  });

  describe('constantTimeEquals', () => {
    it('returns true for identical strings', () => {
      expect(constantTimeEquals('abc', 'abc')).toBe(true);
    });

    it('returns false for different strings of the same length', () => {
      expect(constantTimeEquals('abc', 'abd')).toBe(false);
    });

    it('returns false for different-length strings without throwing', () => {
      expect(constantTimeEquals('abc', 'abcd')).toBe(false);
    });
  });
});
