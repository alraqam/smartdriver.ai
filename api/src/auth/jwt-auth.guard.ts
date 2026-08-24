import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from './decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) {
      if (optional) return true;
      throw new UnauthorizedException('Token talab qilinadi');
    }

    try {
      (req as any).user = await this.jwt.verifyAsync(token);
      return true;
    } catch {
      // On an optional route a BAD token is still an error, unlike a missing
      // one: the caller meant to be authenticated and should be told it failed
      // rather than silently served the signed-out view.
      throw new UnauthorizedException("Token yaroqsiz yoki muddati o'tgan");
    }
  }
}
