import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SessionMode } from '@prisma/client';

export class CreateSessionDto {
  @IsEnum(SessionMode)
  mode!: SessionMode;

  /// Required for `practice`, rejected for the other modes (checked in the
  /// service, where the mode is known).
  @IsOptional()
  @IsString()
  topicId?: string;

  /// Ignored in `exam` mode, which takes its length from the exam settings.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  count?: number;
}

export class AnswerDto {
  @IsString()
  itemId!: string;

  @IsString()
  optionId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  msSpent?: number;
}
