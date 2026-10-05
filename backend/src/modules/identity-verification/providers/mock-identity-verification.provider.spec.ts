import { MockIdentityVerificationProvider } from './mock-identity-verification.provider';

describe('MockIdentityVerificationProvider', () => {
  const baseRequest = {
    userId: 'user-1',
    fullNameAsProvided: 'Ada Lovelace',
    dateOfBirth: '1990-01-01',
    consentTimestamp: new Date().toISOString(),
  };

  it('verifies NINs not ending in 8 or 9', async () => {
    const provider = new MockIdentityVerificationProvider();
    const result = await provider.verifyNin({ ...baseRequest, nin: '12345678901' });
    expect(result.outcome).toBe('VERIFIED');
    expect(result.verifiedFullName).toBe('Ada Lovelace');
    expect(result.providerReference).toMatch(/^MOCK-/);
  });

  it('fails NINs ending in 8', async () => {
    const provider = new MockIdentityVerificationProvider();
    const result = await provider.verifyNin({ ...baseRequest, nin: '12345678908' });
    expect(result.outcome).toBe('FAILED');
    expect(result.failureReason).toBeDefined();
  });

  it('reports NINs ending in 9 as pending, then resolves on status check', async () => {
    const provider = new MockIdentityVerificationProvider();
    const initial = await provider.verifyNin({ ...baseRequest, nin: '12345678909' });
    expect(initial.outcome).toBe('PENDING');

    const followUp = await provider.checkStatus(initial.providerReference);
    expect(followUp.outcome).toBe('VERIFIED');
  });

  it('never includes the raw NIN in the result', async () => {
    const provider = new MockIdentityVerificationProvider();
    const nin = '12345678901';
    const result = await provider.verifyNin({ ...baseRequest, nin });
    expect(JSON.stringify(result)).not.toContain(nin);
  });
});
