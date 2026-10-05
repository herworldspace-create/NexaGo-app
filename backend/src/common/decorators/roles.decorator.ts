import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Marks a route/controller as restricted to the given roles.
 * Must be combined with RolesGuard, which is registered globally.
 *
 * @example
 * @Roles(Role.ADMIN, Role.SUPER_ADMIN)
 * @Get('drivers/pending')
 * listPendingDrivers() { ... }
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
