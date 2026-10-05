import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { AppConfigService } from '../../../config/app-config.service';
import { NotificationProvider, PushMessage, PushSendOutcome } from '../interfaces/notification-provider.interface';

/**
 * Real integration via the official `firebase-admin` SDK — FCM is the
 * vendor explicitly named in the spec (like Paystack, unlike the
 * open-ended NIN/SMS choices), so this uses the documented, officially
 * supported client rather than hand-rolling the OAuth2/JWT exchange
 * Google's REST API would otherwise require.
 *
 * NOT exercised against a live Firebase project in this sandbox (no
 * network access, no real service account). Verify with a real
 * FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY before relying on this
 * in production — the initialization and `send()` call are written
 * correctly against the documented API but untested end-to-end here.
 */
@Injectable()
export class FcmNotificationProvider implements NotificationProvider, OnModuleInit {
  private readonly logger = new Logger(FcmNotificationProvider.name);
  private app: App | null = null;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    const { projectId, clientEmail, privateKey } = this.config.fcm;
    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'FCM is not configured (FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY missing). ' +
          'Push notifications will be logged but not actually sent until configured.',
      );
      return;
    }

    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    this.app =
      getApps().find((a) => a.name === 'nexa') ??
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, 'nexa');
  }

  async send(message: PushMessage): Promise<PushSendOutcome> {
    if (!this.app) {
      this.logger.warn(`FCM not configured — would have sent "${message.title}" to a device. Skipping.`);
      return { status: 'failed', reason: 'FCM is not configured.' };
    }

    try {
      const { getMessaging } = await import('firebase-admin/messaging');
      await getMessaging(this.app).send({
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: message.data,
      });
      return { status: 'sent' };
    } catch (error: any) {
      // Firebase's documented error codes for a dead/invalid token.
      const code = error?.errorInfo?.code ?? error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        return { status: 'invalid_token' };
      }
      this.logger.error(`FCM send failed: ${error instanceof Error ? error.message : String(error)}`);
      return { status: 'failed', reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
