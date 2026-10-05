import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaService } from './config/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    // Required so PaymentsController's webhook handler can verify Paystack's
    // HMAC signature against the exact bytes Paystack signed — a
    // JSON.stringify of the already-parsed body would not reliably match.
    rawBody: true,
  });

  const config = app.get(AppConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.corsAllowedOrigins.length > 0 ? config.corsAllowedOrigins : false,
    credentials: true,
  });
  app.setGlobalPrefix(config.apiPrefix);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`NEXA backend listening on port ${config.port} (prefix: /${config.apiPrefix})`);
}

bootstrap();
