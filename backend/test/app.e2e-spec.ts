import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * E2E smoke tests. These require a real PostgreSQL database reachable via
 * DATABASE_URL and all required env vars set (see .env.example) — they are
 * not run as part of the default `npm test` unit suite.
 *
 * Run with: npm run test:e2e
 */
describe('NEXA backend (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET) is public and returns ok', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('/users/me (GET) requires authentication', () => {
    return request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('/auth/otp/request (POST) rejects an invalid phone number', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: 'not-a-phone-number' })
      .expect(400);
  });

  it('/drivers/verification/status (GET) is blocked for an unauthenticated caller', () => {
    return request(app.getHttpServer()).get('/api/v1/drivers/verification/status').expect(401);
  });
});
