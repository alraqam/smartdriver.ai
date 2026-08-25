import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminGuard } from './admin.guard';
import { PrismaService } from '../prisma/prisma.service';

// This guard is the only thing between a signed-in learner and the ability to
// rewrite the entire question bank, so its failure modes are worth pinning.

function ctxFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(dbUser: { role: Role } | null) {
  const calls: string[] = [];
  const prisma = {
    user: {
      findUnique: async ({ where }: any) => {
        calls.push(where.id);
        return dbUser;
      },
    },
  } as unknown as PrismaService;
  return { guard: new AdminGuard(prisma), calls };
}

describe('AdminGuard', () => {
  it('lets an admin through', async () => {
    const { guard } = guardWith({ role: Role.admin });
    await expect(guard.canActivate(ctxFor({ sub: 'u1' }))).resolves.toBe(true);
  });

  it('refuses a signed-in learner', async () => {
    const { guard } = guardWith({ role: Role.learner });
    await expect(guard.canActivate(ctxFor({ sub: 'u1' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an unauthenticated request', async () => {
    const { guard } = guardWith({ role: Role.admin });
    await expect(guard.canActivate(ctxFor(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a token whose user no longer exists', async () => {
    // A deleted account with a still-valid token must not keep its authority.
    const { guard } = guardWith(null);
    await expect(guard.canActivate(ctxFor({ sub: 'ghost' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  // The reason this guard exists instead of @Roles('admin'): tokens live 30
  // days, so a role claim inside one can be a month out of date.
  it('trusts the database, not the role claim in the token', async () => {
    const { guard } = guardWith({ role: Role.learner });
    // Token still says admin — demoted in the database a moment ago.
    await expect(
      guard.canActivate(ctxFor({ sub: 'u1', role: Role.admin })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('promotes on the strength of the database alone', async () => {
    const { guard } = guardWith({ role: Role.admin });
    // Token was issued before the promotion and still says learner.
    await expect(guard.canActivate(ctxFor({ sub: 'u1', role: Role.learner }))).resolves.toBe(true);
  });

  it('looks the user up by the token subject', async () => {
    const { guard, calls } = guardWith({ role: Role.admin });
    await guard.canActivate(ctxFor({ sub: 'user-42' }));
    expect(calls).toEqual(['user-42']);
  });
});
