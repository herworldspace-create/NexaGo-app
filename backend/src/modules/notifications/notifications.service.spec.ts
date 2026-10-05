import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../config/prisma.service';
import { NotificationProvider } from './interfaces/notification-provider.interface';
import { NotificationStatus, DevicePlatform } from '../../common/enums/notification.enum';

function buildPrismaMock() {
  return {
    deviceToken: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    notification: { create: jest.fn(), update: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  };
}

function buildProviderMock(): jest.Mocked<NotificationProvider> {
  return { send: jest.fn() };
}

const content = { type: 'ride.accepted', title: 'Driver on the way', body: 'body' };

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let provider: jest.Mocked<NotificationProvider>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    provider = buildProviderMock();
    service = new NotificationsService(prisma as unknown as PrismaService, provider);
  });

  describe('registerDeviceToken', () => {
    it('upserts, reassigning an existing token to the new user', async () => {
      prisma.deviceToken.upsert.mockResolvedValue({ id: 'dt-1' });
      await service.registerDeviceToken('user-1', 'token-abc', DevicePlatform.ANDROID);

      expect(prisma.deviceToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: 'token-abc' },
          create: expect.objectContaining({ userId: 'user-1' }),
          update: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });
  });

  describe('unregisterDeviceToken', () => {
    it('is a no-op when the token does not exist', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue(null);
      await expect(service.unregisterDeviceToken('user-1', 'token-x')).resolves.toBeUndefined();
      expect(prisma.deviceToken.update).not.toHaveBeenCalled();
    });

    it('rejects unregistering a token that belongs to someone else', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue({ id: 'dt-1', userId: 'someone-else', token: 'token-x' });
      await expect(service.unregisterDeviceToken('user-1', 'token-x')).rejects.toThrow(ForbiddenException);
    });

    it('deactivates a token the user owns', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue({ id: 'dt-1', userId: 'user-1', token: 'token-x' });
      await service.unregisterDeviceToken('user-1', 'token-x');
      expect(prisma.deviceToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });

  describe('notify', () => {
    it('marks SENT with no push attempted when the user has no active devices', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n1' });
      prisma.deviceToken.findMany.mockResolvedValue([]);

      await service.notify('user-1', content);

      expect(provider.send).not.toHaveBeenCalled();
      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.SENT }) }),
      );
    });

    it('marks SENT when at least one device receives the push', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n1' });
      prisma.deviceToken.findMany.mockResolvedValue([
        { id: 'dt-1', token: 'tok-1' },
        { id: 'dt-2', token: 'tok-2' },
      ]);
      provider.send.mockResolvedValueOnce({ status: 'sent' }).mockResolvedValueOnce({ status: 'failed', reason: 'x' });

      await service.notify('user-1', content);

      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.SENT }) }),
      );
    });

    it('marks FAILED when every device send fails', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n1' });
      prisma.deviceToken.findMany.mockResolvedValue([{ id: 'dt-1', token: 'tok-1' }]);
      provider.send.mockResolvedValue({ status: 'failed', reason: 'network' });

      await service.notify('user-1', content);

      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.FAILED }) }),
      );
    });

    it('deactivates a device token the provider reports as invalid/unregistered', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n1' });
      prisma.deviceToken.findMany.mockResolvedValue([{ id: 'dt-1', token: 'stale-tok' }]);
      provider.send.mockResolvedValue({ status: 'invalid_token' });

      await service.notify('user-1', content);

      expect(prisma.deviceToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'dt-1' }, data: { isActive: false } }),
      );
    });
  });

  describe('markRead', () => {
    it('rejects marking a notification that belongs to someone else', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'someone-else', readAt: null });
      await expect(service.markRead('user-1', 'n1')).rejects.toThrow(ForbiddenException);
    });

    it('throws for a nonexistent notification', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);
      await expect(service.markRead('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('is idempotent — marking an already-read notification does not re-update it', async () => {
      const readAt = new Date();
      prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'user-1', readAt });
      const result = await service.markRead('user-1', 'n1');
      expect(prisma.notification.update).not.toHaveBeenCalled();
      expect(result.readAt).toBe(readAt);
    });
  });
});
