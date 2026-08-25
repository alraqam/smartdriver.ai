import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// Admin authority, re-checked against the database on every request.
///
/// RolesGuard trusts the `role` baked into the JWT, which is correct for
/// learners and wrong here: tokens live 30 days, so revoking someone's admin
/// rights would not actually take effect for a month. An admin can rewrite the
/// entire question bank, which is not authority to leave standing on a stale
/// claim the holder carries around in their pocket.
///
/// The cost is one indexed primary-key lookup, and only on /admin routes —
/// this is deliberately NOT global, or every learner request would pay for it.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.user;
    if (!auth?.sub) throw new UnauthorizedException('Token talab qilinadi');

    const user = await this.prisma.user.findUnique({
      where: { id: auth.sub },
      select: { role: true },
    });

    if (!user || user.role !== Role.admin) {
      throw new ForbiddenException('Bu amal uchun administrator huquqi kerak');
    }
    return true;
  }
}
