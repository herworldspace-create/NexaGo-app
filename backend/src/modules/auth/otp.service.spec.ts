import { BadRequestException, HttpException } from '@nestjs/common';
import { OtpService } from './otp.service';
import { SmsProvider } from '../sms/sms-provider.interface';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../config/prisma.service';

type MockPrisma = {
  otpChallenge: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function buildPrismaMock(): MockPrisma {
  return {
    otpChallenge: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function buildConfigMock(): AppConfigService {
  return {
    otp: {
      codeLength: 6,
      ttlSeconds: 300,
      maxAttempts: 5,
      resendCooldownSeconds: 60,
    },
    jwt: { accessSecret: 'a'.repeat(32) },
  } as unknown as AppConfigService;
}

describe('OtpService', () => {
  let prisma: MockPrisma;
  let provider: jest.Mocked<SmsProvider>;
  let service: OtpService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    provider = { send: jest.fn().mockResolvedValue(undefined) };
    service = new OtpService(prisma as unknown as PrismaService, buildConfigMock(), provider);
  });

  describe('requestOtp', () => {
    it('creates a challenge and delivers a code via the provider', async () => {
      prisma.otpChallenge.findFirst.mockResolvedValue(null);
      prisma.otpChallenge.create.mockResolvedValue({});

      await service.requestOtp('+2348012345678', 'LOGIN' as any);

      expect(prisma.otpChallenge.create).toHaveBeenCalledTimes(1);
      expect(provider.send).toHaveBeenCalledTimes(1);
      const [, message] = provider.send.mock.calls[0];
      expect(message).toMatch(/\d{6}/);
    });

    it('enforces the resend cooldown', async () => {
      prisma.otpChallenge.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(service.requestOtp('+2348012345678', 'LOGIN' as any)).rejects.toThrow(
        HttpException,
      );
      expect(provider.send).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('rejects when there is no active challenge', async () => {
      prisma.otpChallenge.findFirst.mockResolvedValue(null);
      await expect(service.verifyOtp('+2348012345678', 'LOGIN' as any, '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired challenge', async () => {
      prisma.otpChallenge.findFirst.mockResolvedValue({
        id: '1',
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
        maxAttempts: 5,
        codeHash: 'irrelevant',
      });
      await expect(service.verifyOtp('+2348012345678', 'LOGIN' as any, '123456')).rejects.toThrow(
        'This code has expired',
      );
    });

    it('rejects once max attempts are exceeded', async () => {
      prisma.otpChallenge.findFirst.mockResolvedValue({
        id: '1',
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 5,
        maxAttempts: 5,
        codeHash: 'irrelevant',
      });
      await expect(service.verifyOtp('+2348012345678', 'LOGIN' as any, '123456')).rejects.toThrow(
        'Too many incorrect attempts',
      );
    });

    it('increments attempts and rejects an incorrect code', async () => {
      prisma.otpChallenge.findFirst.mockResolvedValue({
        id: '1',
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        maxAttempts: 5,
        codeHash: 'does-not-match-anything',
      });
      prisma.otpChallenge.update.mockResolvedValue({});

      await expect(service.verifyOtp('+2348012345678', 'LOGIN' as any, '000000')).rejects.toThrow(
        'Incorrect code',
      );
      expect(prisma.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it('accepts a correct code and marks the challenge consumed', async () => {
      // Generate the same hash the service would, using the known secret.
      const { hmacHash } = jest.requireActual('../../common/utils/hash.util');
      const codeHash = hmacHash('123456', 'a'.repeat(32));

      prisma.otpChallenge.findFirst.mockResolvedValue({
        id: '1',
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        maxAttempts: 5,
        codeHash,
      });
      prisma.otpChallenge.update.mockResolvedValue({});

      await expect(
        service.verifyOtp('+2348012345678', 'LOGIN' as any, '123456'),
      ).resolves.toBeUndefined();

      expect(prisma.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { consumedAt: expect.any(Date) } }),
      );
    });
  });
});
