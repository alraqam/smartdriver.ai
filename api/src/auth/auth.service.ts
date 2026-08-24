import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Locale } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EskizService } from '../eskiz/eskiz.service';
import { normalizePhone } from '../common/phone';
import { AuthUser } from './decorators';

// How long a code stays usable. Long enough to survive a slow SMS route,
// short enough that a code glimpsed on a lock screen is worthless by the time
// anyone acts on it.
const OTP_TTL_MS = 5 * 60 * 1000;

// A learner may not request a new code more often than this. Stops the resend
// button from being an SMS-billing faucet.
const RESEND_COOLDOWN_MS = 60 * 1000;

// Wrong guesses allowed against one code before it is burned. A 6-digit code
// with 5 tries is a 1-in-200,000 shot; without a cap it is brute-forceable in
// minutes.
const MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly eskiz: EskizService,
  ) {}

  /// Issue a code and text it. Returns nothing that identifies whether the
  /// phone is already registered — the response is identical either way, so
  /// this endpoint cannot be used to enumerate who has an account.
  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);

    const last = await this.prisma.otpCode.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000,
      );
      // Nest has no TooManyRequestsException; 429 is the honest status here.
      throw new HttpException(
        `Yangi kod ${waitSec} soniyadan keyin so'ralishi mumkin.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Any earlier live code for this phone is retired the moment a new one is
    // issued, so only the most recent SMS ever works.
    await this.prisma.otpCode.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash: bcrypt.hashSync(code, 10),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    await this.eskiz.sendSms(
      phone,
      `SmartDriverAI tasdiqlash kodi: ${code}. Kod ${OTP_TTL_MS / 60000} daqiqa amal qiladi.`,
    );

    return {
      sent: true,
      phone,
      expiresInSec: OTP_TTL_MS / 1000,
      // Tells the web app to show a demo hint instead of leaving someone
      // waiting for an SMS that will never arrive.
      mock: this.eskiz.isMock,
      // DEMO ONLY. Returning a one-time code in the HTTP response defeats the
      // entire point of sending it out-of-band, so it is gated on Eskiz mock
      // mode — and mock mode is unreachable in production, because main.ts
      // refuses to boot there without Eskiz credentials. That assertion is
      // what makes this safe; do not weaken one without the other.
      //
      // Set DEMO_SHOW_OTP=false to suppress it even in mock mode (e.g. a
      // shared staging box where NODE_ENV is not 'production').
      ...(this.showOtpInResponse ? { devCode: code } : {}),
    };
  }

  /// Whether the OTP may be echoed back to the caller. See requestOtp.
  private get showOtpInResponse(): boolean {
    if (!this.eskiz.isMock) return false;
    if (process.env.NODE_ENV === 'production') return false;
    return process.env.DEMO_SHOW_OTP !== 'false';
  }

  /// Verify a code and hand back a token. First successful verification for a
  /// phone creates the account — there is no separate registration step.
  async verifyOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);

    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new UnauthorizedException("Kod topilmadi. Qaytadan so'rang.");

    if (otp.expiresAt.getTime() < Date.now()) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      throw new UnauthorizedException("Kod muddati tugagan. Qaytadan so'rang.");
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      throw new UnauthorizedException(
        "Juda ko'p urinish. Yangi kod so'rang.",
      );
    }

    if (!bcrypt.compareSync(String(code ?? ''), otp.codeHash)) {
      // Count the failure before rejecting, so the attempt cap actually binds.
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException("Kod noto'g'ri.");
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date() },
        })
      : await this.prisma.user.create({ data: { phone } });

    if (!existing) this.logger.log(`New learner registered: ${phone}`);

    return { ...(await this.issueToken(user)), isNewUser: !existing };
  }

  private async issueToken(user: {
    id: string;
    phone: string;
    name: string | null;
    role: AuthUser['role'];
    locale: Locale;
  }) {
    const payload: AuthUser = {
      sub: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      locale: user.locale,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        locale: user.locale,
      },
    };
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi');
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      locale: user.locale,
      createdAt: user.createdAt,
    };
  }

  async updateMe(auth: AuthUser, data: { name?: string; locale?: Locale }) {
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new BadRequestException("Ism bo'sh bo'lishi mumkin emas");
    }
    const user = await this.prisma.user.update({
      where: { id: auth.sub },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.locale !== undefined ? { locale: data.locale } : {}),
      },
    });
    return { id: user.id, phone: user.phone, name: user.name, role: user.role, locale: user.locale };
  }
}
