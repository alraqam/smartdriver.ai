import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RequestOtpDto, UpdateMeDto, VerifyOtpDto } from './dto';
import { AuthUser, CurrentUser, Public } from './decorators';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Every OTP request costs real money once Eskiz is live, so this is the
  // tightest limit in the app: 5 per minute per IP on top of the per-phone
  // cooldown enforced in the service.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('auth/otp/request')
  @HttpCode(200)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  // Rate-limited independently of the request endpoint: guessing codes and
  // asking for codes are different attacks.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('auth/otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Get('auth/me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(user, dto);
  }
}
