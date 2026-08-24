import { IsEnum, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Locale } from '@prisma/client';

export class RequestOtpDto {
  // Deliberately loose: every accepted spelling is normalised in
  // common/phone.ts, which owns the real validation and the error message.
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone!: string;

  @IsString()
  @Length(6, 6, { message: 'Kod 6 xonali bo\'lishi kerak' })
  code!: string;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}
