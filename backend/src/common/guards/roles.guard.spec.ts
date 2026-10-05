import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../enums/role.enum';

function buildContext(user: { userId: string; role: Role; sessionId: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows access when no roles are required', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(buildContext({ userId: '1', role: Role.PASSENGER, sessionId: 's' }))).toBe(
      true,
    );
  });

  it('allows access when the user has a required role', () => {
    const reflector = { getAllAndOverride: () => [Role.ADMIN, Role.SUPER_ADMIN] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(buildContext({ userId: '1', role: Role.ADMIN, sessionId: 's' }))).toBe(true);
  });

  it('denies access when the user lacks a required role', () => {
    const reflector = { getAllAndOverride: () => [Role.ADMIN] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() =>
      guard.canActivate(buildContext({ userId: '1', role: Role.PASSENGER, sessionId: 's' })),
    ).toThrow(ForbiddenException);
  });

  it('denies access when there is no authenticated user at all', () => {
    const reflector = { getAllAndOverride: () => [Role.ADMIN] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });
});
