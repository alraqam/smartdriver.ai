import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Locale } from '@prisma/client';

export class ExplainDto {
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  /// The option the learner picked. Omitted gives the generic explanation.
  @IsOptional()
  @IsString()
  wrongOptionId?: string;
}

export class CreateThreadDto {
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}

export class AskDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  question!: string;
}
