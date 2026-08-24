import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

const DEV_SECRET = 'smartdriverai-dev-secret';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || DEV_SECRET,
      // Learners sign in on a phone and should not be asked for an SMS code
      // every week; main.ts refuses to boot production on the dev secret, so a
      // long-lived token here is not a long-lived weak token.
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '30d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
