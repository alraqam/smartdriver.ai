import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Locale, Role } from '@prisma/client';

// Mark a route as public (skips the global JWT guard).
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Restrict a route to specific roles (checked by RolesGuard).
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// Mark a route as optionally authenticated: a valid token is used if present,
// a missing one is not an error. Used by GET /topics, which shows per-learner
// mastery when signed in and the plain topic list when not.
export const OPTIONAL_AUTH_KEY = 'optionalAuth';
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

export interface AuthUser {
  sub: string;
  phone: string;
  name: string | null;
  role: Role;
  locale: Locale;
}

// Inject the authenticated user into a handler param. Undefined on an
// @OptionalAuth route when the caller sent no token.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    return ctx.switchToHttp().getRequest().user;
  },
);
