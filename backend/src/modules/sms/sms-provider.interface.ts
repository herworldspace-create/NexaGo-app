/**
 * Abstraction over "however we send a text message to a phone number".
 * Originally lived inside the auth module (OTP delivery only); relocated
 * here once a second consumer (delivery recipient PIN notifications)
 * needed the same capability, so there's one shared abstraction rather
 * than two near-identical ones.
 */
export interface SmsProvider {
  /**
   * Send `message` to `phone`. Must throw if delivery cannot be confirmed
   * as accepted by the upstream provider.
   */
  send(phone: string, message: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
