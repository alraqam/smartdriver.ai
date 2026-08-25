import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/// One answer as it happened on the device.
///
/// Note what is NOT here: whether it was right. The client knows — it has the
/// answer key from the pack — but a score the client asserts is a score the
/// client can invent, and readiness is built on these. The server re-grades
/// every answer against its own options.
export class OfflineAnswerDto {
  @IsString()
  @Length(1, 64)
  questionId!: string;

  @IsString()
  @Length(1, 64)
  optionId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  msSpent?: number;
}

export class OfflineSessionDto {
  /// Minted on the device before the first answer. This is what makes a retry
  /// safe: the same drill synced twice lands on the same row.
  @IsString()
  @Length(8, 64)
  clientId!: string;

  @IsString()
  @Length(1, 64)
  topicId!: string;

  @IsISO8601()
  startedAt!: string;

  @IsISO8601()
  finishedAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  // Same ceiling as an online practice session; a device claiming more than a
  // sitting's worth of answers is a bug or an attempt at one.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OfflineAnswerDto)
  answers!: OfflineAnswerDto[];
}

export class SyncSessionsDto {
  @IsArray()
  @ArrayMinSize(1)
  // Bounded so one request cannot ask for unbounded work. A device that has
  // been offline for a fortnight flushes its queue in batches.
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => OfflineSessionDto)
  sessions!: OfflineSessionDto[];
}
