export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type PushSendOutcome =
  | { status: 'sent' }
  | { status: 'invalid_token' } // token is stale/unregistered — caller should deactivate it
  | { status: 'failed'; reason: string };

export interface NotificationProvider {
  send(message: PushMessage): Promise<PushSendOutcome>;
}

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');
