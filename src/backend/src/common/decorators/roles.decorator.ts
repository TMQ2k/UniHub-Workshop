import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/auth/entities/user.entity.js';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles are allowed to access an endpoint.
 * Usage: @Roles(UserRole.ORGANIZER, UserRole.STUDENT)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
