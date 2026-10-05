import { WsException } from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

export async function validateWsPayload<T extends object>(
  cls: new () => T,
  payload: unknown,
): Promise<T> {
  const instance = plainToInstance(cls, payload ?? {});
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new WsException(messages.join('; ') || 'Invalid payload.');
  }
  return instance;
}
