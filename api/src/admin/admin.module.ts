import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { ContentModule } from '../content/content.module';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone';

/// Grants admin to the phone in ADMIN_PHONE at boot.
///
/// There has to be some way to mint the FIRST admin, and every alternative is
/// worse: a self-serve promotion endpoint is an open door, and a seeded
/// password is a credential in the repo. An env var on the box means the
/// person who can already deploy is the person who can appoint an admin, which
/// is the authority they have anyway.
///
/// Deliberately promote-only. It never demotes anyone: clearing ADMIN_PHONE
/// after a redeploy should not silently strip access from whoever is running
/// content, and a redeploy is not a decision about who should be an admin.
@Injectable()
export class AdminBootstrap implements OnModuleInit {
  private readonly logger = new Logger('AdminBootstrap');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const raw = process.env.ADMIN_PHONE?.trim();
    if (!raw) return;

    let phone: string;
    try {
      phone = normalizePhone(raw);
    } catch {
      this.logger.error(`ADMIN_PHONE is not a valid Uzbek number: "${raw}" — ignoring.`);
      return;
    }

    const name = process.env.ADMIN_NAME?.trim() || undefined;

    // Created if absent, so an admin can be appointed before they have ever
    // signed in; they then sign in by OTP like anyone else.
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone, role: Role.admin, ...(name ? { name } : {}) },
      update: { role: Role.admin, ...(name ? { name } : {}) },
    });

    this.logger.log(`Admin granted to ${phone}${user.name ? ` (${user.name})` : ''}`);
  }
}

@Module({
  imports: [ContentModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, AdminBootstrap],
})
export class AdminModule {}
