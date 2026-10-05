import { of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { PrismaService } from '../../config/prisma.service';

function buildContext(params: { user?: any; routeParams?: any; body?: any }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: params.user, params: params.routeParams ?? {}, body: params.body ?? {} }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function buildHandler(response: unknown): CallHandler {
  return { handle: () => of(response) };
}

describe('AuditLogInterceptor', () => {
  it('does nothing when the route has no @AuditLog metadata', (done) => {
    const create = jest.fn();
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const interceptor = new AuditLogInterceptor(reflector, { adminAuditLog: { create } } as unknown as PrismaService);

    interceptor
      .intercept(buildContext({ user: { userId: 'admin-1' } }), buildHandler({ id: 'x' }))
      .subscribe(() => {
        expect(create).not.toHaveBeenCalled();
        done();
      });
  });

  it('writes an audit log referencing the responding entity id and redacts sensitive body fields', (done) => {
    const create = jest.fn();
    const reflector = {
      getAllAndOverride: () => ({ action: 'DRIVER_DOCUMENT_APPROVED', targetType: 'DriverDocument' }),
    } as unknown as Reflector;
    const interceptor = new AuditLogInterceptor(reflector, { adminAuditLog: { create } } as unknown as PrismaService);

    interceptor
      .intercept(
        buildContext({
          user: { userId: 'admin-1' },
          routeParams: { documentId: 'doc-1' },
          body: { reason: 'looks fine', nin: '12345678901' },
        }),
        buildHandler({ id: 'doc-1', status: 'APPROVED' }),
      )
      .subscribe(() => {
        expect(create).toHaveBeenCalledTimes(1);
        const payload = create.mock.calls[0][0].data;
        expect(payload.adminUserId).toBe('admin-1');
        expect(payload.action).toBe('DRIVER_DOCUMENT_APPROVED');
        expect(payload.targetType).toBe('DriverDocument');
        expect(payload.targetId).toBe('doc-1');
        expect(JSON.stringify(payload.metadata)).not.toContain('12345678901');
        expect(JSON.stringify(payload.metadata)).toContain('[REDACTED]');
        done();
      });
  });

  it('never writes a log if there is no authenticated actor', (done) => {
    const create = jest.fn();
    const reflector = {
      getAllAndOverride: () => ({ action: 'DRIVER_DOCUMENT_APPROVED', targetType: 'DriverDocument' }),
    } as unknown as Reflector;
    const interceptor = new AuditLogInterceptor(reflector, { adminAuditLog: { create } } as unknown as PrismaService);

    interceptor
      .intercept(buildContext({ user: undefined }), buildHandler({ id: 'doc-1' }))
      .subscribe(() => {
        expect(create).not.toHaveBeenCalled();
        done();
      });
  });
});
