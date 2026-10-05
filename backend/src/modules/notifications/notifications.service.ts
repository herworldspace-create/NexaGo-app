import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationStatus, DevicePlatform } from '../../common/enums/notification.enum';
import { NOTIFICATION_PROVIDER, NotificationProvider } from './interfaces/notification-provider.interface';
import { NotificationContent } from './notification-content.util';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  async registerDeviceToken(userId: string, token: string, platform: DevicePlatform) {
    // A token can legitimately move to a different account (device
    // logged out, different user logs in) — reassign rather than reject.
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform: platform as any, isActive: true },
      update: { userId, platform: platform as any, isActive: true },
    });
  }

  async unregisterDeviceToken(userId: string, token: string): Promise<void> {
    const existing = await this.prisma.deviceToken.findUnique({ where: { token } });
    if (!existing) return; // already gone — nothing to do
    if (existing.userId !== userId) {
      throw new ForbiddenException('This device token does not belong to you.');
    }
    await this.prisma.deviceToken.update({ where: { token }, data: { isActive: false } });
  }

  /**
   * Creates the in-app notification record and, best-effort, pushes it to
   * every active device registered for this user. A push failure never
   * throws — the in-app inbox entry is the durable source of truth;
   * push is a delivery nicety on top of it. A device reported dead by
   * the provider is deactivated so we stop wasting sends on it.
   */
  async notify(userId: string, content: NotificationContent, data?: Record<string, string>): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: content.type,
        title: content.title,
        body: content.body,
        data: data ?? undefined,
        status: NotificationStatus.PENDING as any,
      },
    });

    const tokens = await this.prisma.deviceToken.findMany({ where: { userId, isActive: true } });

    if (tokens.length === 0) {
      // No push channel available, but the in-app inbox entry still exists.
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT as any, sentAt: new Date() },
      });
      return;
    }

    let successCount = 0;
    for (const deviceToken of tokens) {
      const outcome = await this.provider.send({
        token: deviceToken.token,
        title: content.title,
        body: content.body,
        data,
      });

      if (outcome.status === 'sent') {
        successCount += 1;
      } else if (outcome.status === 'invalid_token') {
        await this.prisma.deviceToken.update({ where: { id: deviceToken.id }, data: { isActive: false } });
      }
    }

    await this.prisma.notification.update({
      where: { id: notification.id },
      data:
        successCount > 0
          ? { status: NotificationStatus.SENT as any, sentAt: new Date() }
          : { status: NotificationStatus.FAILED as any },
    });
  }

  async list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('This notification does not belong to you.');
    }
    if (notification.readAt) {
      return notification;
    }
    return this.prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
}
